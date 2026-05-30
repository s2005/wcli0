import http from 'http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { debugLog, errorLog } from './log.js';
import {
  isOriginAllowed,
  corsOriginToEcho,
  trackSockets
} from './httpShared.js';

// The single endpoint served by the Streamable HTTP transport.
const MCP_PATH = '/mcp';

// Cap the JSON body we buffer before handing it to the SDK transport. A
// JSON-RPC request body is small; this guards against an unbounded read from a
// hostile or buggy client without imposing a limit real clients would hit.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

interface StreamableSession {
  transport: StreamableHTTPServerTransport;
  server: Server;
}

/**
 * True when the parsed POST body should open a new session, i.e. it is an
 * `initialize` request. A client may send `initialize` either as a bare object
 * or as a single-message JSON-RPC batch (`[{...}]`); the SDK transport accepts
 * both, so the wrapper must recognize both before routing to session creation.
 * Multi-message batches are intentionally excluded: the SDK rejects a batch
 * that also carries an `initialize`, so leaving them on the non-initialize path
 * avoids building a per-session server the transport would immediately reject.
 */
function isInitializeRequestBody(body: unknown): boolean {
  if (isInitializeRequest(body)) {
    return true;
  }
  return Array.isArray(body) && body.length === 1 && isInitializeRequest(body[0]);
}

/**
 * Read and JSON-parse a request body once, so it can be passed to the SDK
 * transport's handleRequest() as a pre-parsed body (the SDK then does not read
 * the stream again). Resolves `undefined` for an empty body and rejects on
 * invalid JSON or an over-size body.
 */
function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw === '') {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Create an HTTP server exposing the MCP Streamable HTTP transport (protocol
 * revision 2025-03-26) on a single `/mcp` endpoint:
 *
 * - `POST /mcp` carries client-to-server JSON-RPC messages. An `initialize`
 *   request without a session id creates a new session: a fresh server instance
 *   from `createServer()` is connected to a new StreamableHTTPServerTransport
 *   with a UUID `sessionIdGenerator`. Subsequent requests carry the assigned
 *   `Mcp-Session-Id` header and route to the stored transport.
 * - `GET /mcp` opens the server-to-client SSE stream for an existing session.
 * - `DELETE /mcp` terminates an existing session.
 *
 * Sessions are stateful and isolated: each has its own server instance, so one
 * client's `set_current_directory` cannot affect another's. Origin validation,
 * CORS echo, OPTIONS preflight, malformed-Host handling and socket tracking
 * mirror the legacy SSE transport via the shared httpShared helpers.
 */
export function createStreamableHttpServer(
  createServer: () => Server,
  host: string,
  port: number,
  allowedOrigins: readonly string[] = []
): Promise<http.Server> {
  const sessions = new Map<string, StreamableSession>();

  const httpServer = http.createServer(async (req, res) => {
    // Parse the request URL defensively. A malformed Host header makes
    // `new URL()` throw; in this async callback that would surface as an
    // unhandled rejection and could crash the process. Return 400 instead.
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      errorLog(`Rejected Streamable HTTP request with malformed Host header: ${req.headers.host}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request' }));
      return;
    }

    // Reject browser requests from untrusted origins before any work
    // (DNS-rebinding defense). Non-browser clients send no Origin and pass.
    if (!isOriginAllowed(req.headers.origin, host, allowedOrigins)) {
      errorLog(`Rejected Streamable HTTP request from disallowed origin: ${req.headers.origin}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }

    // The origin is trusted at this point. Echo it back so browser clients on an
    // allowed origin can read responses (and the Mcp-Session-Id header) across
    // origins. Non-browser clients send no Origin and get no CORS headers.
    const corsOrigin = corsOriginToEcho(req.headers.origin);
    const corsHeaders = (extra: http.OutgoingHttpHeaders = {}): http.OutgoingHttpHeaders =>
      corsOrigin
        ? {
            ...extra,
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Expose-Headers': 'Mcp-Session-Id',
            Vary: 'Origin'
          }
        : extra;
    const applyCors = (): void => {
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
        res.setHeader('Vary', 'Origin');
      }
    };

    // Answer CORS preflight. A cross-origin POST /mcp with a JSON or
    // Mcp-Session-Id header triggers an OPTIONS preflight.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders({
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        // Mcp-Protocol-Version is sent by clients on every post-initialize
        // request; it must be allow-listed or browsers block those requests.
        'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
        'Access-Control-Max-Age': '86400'
      }));
      res.end();
      return;
    }

    if (url.pathname !== MCP_PATH) {
      res.writeHead(404, corsHeaders());
      res.end('Not Found');
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        errorLog('Rejected Streamable HTTP POST with unreadable body:', err);
        res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error: invalid JSON body' },
          id: null
        }));
        return;
      }

      // Route to an existing session.
      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        applyCors();
        try {
          await transport.handleRequest(req, res, body);
        } catch (err) {
          errorLog('Error handling Streamable HTTP POST:', err);
          if (!res.headersSent) {
            res.writeHead(500, corsHeaders());
            res.end('Internal Server Error');
          }
        }
        return;
      }

      // A new session is created only by an `initialize` POST with no session id
      // (sent either as a bare object or a single-message batch).
      if (!sessionId && isInitializeRequestBody(body)) {
        // Build the per-session server first so it is captured by the
        // onsessioninitialized / onclose callbacks below.
        const sessionServer = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, server: sessionServer });
            debugLog(`Streamable HTTP session established: ${id}`);
          }
        });

        // Register session removal *before* connect(). connect() may write the
        // response and the client can disconnect before this function returns;
        // attaching onclose up front closes the disconnect-during-connect race
        // that would otherwise leak the session map entry (mirrors the SSE fix).
        transport.onclose = () => {
          const id = transport.sessionId;
          if (id && sessions.delete(id)) {
            debugLog(`Streamable HTTP session closed: ${id}`);
          }
        };

        applyCors();
        try {
          await sessionServer.connect(transport);
          await transport.handleRequest(req, res, body);
        } catch (err) {
          errorLog('Error establishing Streamable HTTP session:', err);
          if (!res.headersSent) {
            res.writeHead(500, corsHeaders());
            res.end('Internal Server Error');
          }
        }
        return;
      }

      // POST with an unknown session id (404) or a non-initialize request with
      // no session id (400) -- the SDK's stateful-mode semantics.
      res.writeHead(sessionId ? 404 : 400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: sessionId
            ? 'Session not found'
            : 'Bad Request: no valid session ID for a non-initialize request'
        },
        id: null
      }));
      return;
    }

    // GET (open the SSE stream) and DELETE (terminate) require an existing
    // session; the SDK transport implements their method-specific behavior.
    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(404, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
      const { transport } = sessions.get(sessionId)!;
      applyCors();
      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        errorLog(`Error handling Streamable HTTP ${req.method}:`, err);
        if (!res.headersSent) {
          res.writeHead(500, corsHeaders());
          res.end('Internal Server Error');
        }
      }
      return;
    }

    res.writeHead(405, corsHeaders({ Allow: 'GET, POST, DELETE, OPTIONS' }));
    res.end('Method Not Allowed');
  });

  // Track open sockets so the server can be force-closed even with a live
  // /mcp SSE stream (see closeHttpServer in httpShared).
  trackSockets(httpServer);

  return new Promise((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      resolve(httpServer);
    });
  });
}
