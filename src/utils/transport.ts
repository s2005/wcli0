import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { debugLog, errorLog } from './log.js';
import {
  isOriginAllowed,
  corsOriginToEcho,
  trackSockets,
  closeHttpServer
} from './httpShared.js';

// Re-export the shared origin check so existing importers (and tests) that
// reference it via this module keep working after the helpers moved to
// httpShared.ts.
export { isOriginAllowed };

export function createSseServer(
  createServer: () => Server,
  host: string,
  port: number,
  allowedOrigins: readonly string[] = []
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
    if (!isOriginAllowed(req.headers.origin, host, allowedOrigins)) {
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

        // Prune the session as soon as its underlying response closes. This is
        // registered on `res` *before* connect() rather than by overwriting
        // transport.onclose afterward, which closes a race: connect() calls
        // transport.start(), which writes the SSE headers and attaches the SDK's
        // own `res` close listener while connect() is still awaiting. A client
        // that opens /sse and immediately disconnects can fire that listener
        // before execution returns here, so an after-the-fact onclose handler
        // would never run -- leaking this map entry and making later POSTs to the
        // dead session return 500 instead of 404. Listening on `res` directly is
        // race-free because the listener is in place before the response can
        // close. The SDK transport still runs its own onclose for protocol
        // teardown; this listener only removes the routing entry, and the
        // per-session server holds no OS resources once its transport closes, so
        // it is left for GC.
        res.on('close', () => {
          sessions.delete(transport.sessionId);
          debugLog(`SSE session closed: ${transport.sessionId}`);
        });

        await sessionServer.connect(transport);

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
  // runtimes without closeAllConnections() (see closeHttpServer in httpShared).
  trackSockets(httpServer);

  return new Promise((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      resolve(httpServer);
    });
  });
}

/**
 * Close the legacy SSE HTTP server and release its port. Thin wrapper over the
 * shared closeHttpServer() so existing callers keep their import; the
 * force-destroy logic for long-lived SSE streams now lives in httpShared.ts.
 */
export function closeSseServer(server: http.Server): Promise<void> {
  return closeHttpServer(server);
}
