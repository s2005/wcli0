import http from 'http';
import type { Socket } from 'net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { debugLog, errorLog } from './log.js';

// Loopback hostnames that are always trusted as request origins. `URL.hostname`
// returns the bracketed form for IPv6, so both `::1` and `[::1]` are listed.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// Open TCP sockets tracked per server so closeSseServer() can force-destroy them
// on Node runtimes that lack http.Server.closeAllConnections() (added in 18.2).
// Keyed weakly so entries disappear when a server is garbage-collected.
const serverSockets = new WeakMap<http.Server, Set<Socket>>();

/**
 * Decide whether an incoming request's `Origin` header may use the SSE
 * transport. Requests with no `Origin` header are treated as non-browser
 * clients (native MCP clients, curl) and are permitted. A present `Origin` must
 * point at a loopback host or the configured bind host; everything else --
 * including malformed values and the literal `null` origin used by sandboxed
 * iframes and `file://` pages -- is rejected.
 *
 * This blocks DNS-rebinding attacks: the browser sets `Origin` to the page's own
 * domain (for example `https://evil.example`), not the rebound `127.0.0.1`
 * address, so allowlisting trusted origins rejects the attacker even when their
 * domain resolves to loopback.
 */
export function isOriginAllowed(originHeader: string | undefined, bindHost: string): boolean {
  // No Origin header => non-browser client. Allow.
  if (originHeader === undefined) {
    return true;
  }
  // The literal "null" origin and empty values are untrusted.
  if (originHeader === 'null' || originHeader.trim() === '') {
    return false;
  }
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname.toLowerCase();
  } catch {
    // Malformed Origin header.
    return false;
  }
  if (LOOPBACK_HOSTS.has(hostname)) {
    return true;
  }
  return bindHost.trim() !== '' && hostname === bindHost.trim().toLowerCase();
}

/**
 * Return the `Origin` value to echo back via CORS headers, or `undefined` when
 * the request is from a non-browser client (no usable Origin). Only call this
 * after isOriginAllowed() has accepted the request, so a returned value is
 * guaranteed to be a trusted origin that is safe to reflect.
 */
function corsOriginToEcho(originHeader: string | undefined): string | undefined {
  if (originHeader === undefined || originHeader === 'null' || originHeader.trim() === '') {
    return undefined;
  }
  return originHeader;
}

export function createSseServer(
  createServer: () => Server,
  host: string,
  port: number
): Promise<http.Server> {
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    // Parse the request URL defensively. A malformed Host header (for example
    // "%%%%") makes `new URL()` throw; because this callback is async that throw
    // would surface as an unhandled rejection and, under Node's default policy,
    // crash the process. Return 400 instead so a bad request cannot take the
    // server down.
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      errorLog(`Rejected SSE request with malformed Host header: ${req.headers.host}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request' }));
      return;
    }

    // Reject browser requests from untrusted origins before doing any work
    // (DNS-rebinding defense). Non-browser clients send no Origin and pass.
    if (!isOriginAllowed(req.headers.origin, host)) {
      errorLog(`Rejected SSE request from disallowed origin: ${req.headers.origin}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }

    // The origin is trusted at this point. Echo it back so browser EventSource/
    // fetch clients served from an allowed origin on a different port can read
    // the responses; without Access-Control-Allow-Origin the browser blocks the
    // MCP handshake. Non-browser clients send no Origin and get no CORS headers,
    // preserving prior behavior.
    const corsOrigin = corsOriginToEcho(req.headers.origin);
    const applyCors = (): void => {
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Vary', 'Origin');
      }
    };
    const corsHeaders = (extra: http.OutgoingHttpHeaders = {}): http.OutgoingHttpHeaders =>
      corsOrigin
        ? { ...extra, 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' }
        : extra;

    // Answer CORS preflight requests. A cross-origin `POST /messages` with
    // `application/json` triggers an OPTIONS preflight that would otherwise fall
    // through to 404 and block the real request.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders({
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      }));
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sse') {
      try {
        // Set CORS headers before the transport writes its own SSE headers;
        // writeHead() merges previously set headers, so the echoed origin
        // survives onto the 200 event-stream response.
        applyCors();
        const transport = new SSEServerTransport('/messages', res);
        // Each SSE connection gets its own MCP server instance. The MCP Protocol
        // object owns a single transport at a time (connect() overwrites
        // this._transport), so sharing one server across sessions would misroute
        // a session's responses to the most recently connected stream.
        const sessionServer = createServer();
        sessions.set(transport.sessionId, transport);

        await sessionServer.connect(transport);

        // sessionServer.connect() assigns its own transport.onclose handler, so
        // any handler set before connect() is overwritten. Register session
        // cleanup afterward and chain to the SDK handler so the MCP server's own
        // teardown still runs. Without this the session is never removed from
        // the map on disconnect, leaking entries and making later POSTs to the
        // dead session return 500 instead of 404. The per-session server holds no
        // OS resources once its transport closes, so it is left for GC.
        const mcpOnClose = transport.onclose;
        transport.onclose = () => {
          sessions.delete(transport.sessionId);
          debugLog(`SSE session closed: ${transport.sessionId}`);
          mcpOnClose?.();
        };

        debugLog(`SSE session established: ${transport.sessionId}`);
      } catch (err) {
        errorLog('Error establishing SSE connection:', err);
        if (!res.headersSent) {
          res.writeHead(500, corsHeaders());
          res.end('Internal Server Error');
        }
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ error: 'Missing sessionId parameter' }));
        return;
      }

      const transport = sessions.get(sessionId);
      if (!transport) {
        res.writeHead(404, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      try {
        // Echo CORS before handlePostMessage writes the 202/4xx response.
        applyCors();
        await transport.handlePostMessage(req, res);
      } catch (err) {
        errorLog('Error handling POST message:', err);
        if (!res.headersSent) {
          res.writeHead(500, corsHeaders());
          res.end('Internal Server Error');
        }
      }
      return;
    }

    res.writeHead(404, corsHeaders());
    res.end('Not Found');
  });

  // Track open sockets so closeSseServer() can force them closed even on Node
  // runtimes without closeAllConnections() (see closeSseServer below).
  const openSockets = new Set<Socket>();
  serverSockets.set(httpServer, openSockets);
  httpServer.on('connection', (socket) => {
    openSockets.add(socket);
    socket.once('close', () => openSockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      resolve(httpServer);
    });
  });
}

export function closeSseServer(server: http.Server): Promise<void> {
  // http.Server.close() only stops accepting new connections and waits for
  // existing ones to end on their own. SSE streams are long-lived, so without
  // forcibly destroying open sockets the server never finishes closing and the
  // event loop stays alive (surfacing as the Jest "worker failed to exit
  // gracefully" warning).
  const destroyOpenConnections = () => {
    const closeAll = (server as { closeAllConnections?: () => void }).closeAllConnections;
    if (typeof closeAll === 'function') {
      closeAll.call(server);
      return;
    }
    // closeAllConnections() was added in Node 18.2. On 18.0/18.1 it is
    // undefined, so destroy the sockets tracked at accept time instead;
    // otherwise close() would hang waiting for active SSE streams to end.
    const openSockets = serverSockets.get(server);
    openSockets?.forEach((socket) => socket.destroy());
  };

  return new Promise((resolve, reject) => {
    if (!server.listening) {
      destroyOpenConnections();
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    // Destroy lingering sockets so close() can complete promptly.
    destroyOpenConnections();
  });
}
