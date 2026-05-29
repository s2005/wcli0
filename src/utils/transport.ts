import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { debugLog, errorLog } from './log.js';

// Loopback hostnames that are always trusted as request origins. `URL.hostname`
// returns the bracketed form for IPv6, so both `::1` and `[::1]` are listed.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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

export function createSseServer(
  createServer: () => Server,
  host: string,
  port: number
): Promise<http.Server> {
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // Reject browser requests from untrusted origins before doing any work
    // (DNS-rebinding defense). Non-browser clients send no Origin and pass.
    if (!isOriginAllowed(req.headers.origin, host)) {
      errorLog(`Rejected SSE request from disallowed origin: ${req.headers.origin}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sse') {
      try {
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
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId parameter' }));
        return;
      }

      const transport = sessions.get(sessionId);
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      try {
        await transport.handlePostMessage(req, res);
      } catch (err) {
        errorLog('Error handling POST message:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
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
  // gracefully" warning). closeAllConnections() was added in Node 18.2, so it
  // is called defensively to remain compatible with older 18.x runtimes.
  const destroyOpenConnections = () => {
    const closeAll = (server as { closeAllConnections?: () => void }).closeAllConnections;
    if (typeof closeAll === 'function') {
      closeAll.call(server);
    }
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
