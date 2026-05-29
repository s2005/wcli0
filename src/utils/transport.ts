import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { debugLog, errorLog } from './log.js';

export function createSseServer(
  mcpServer: Server,
  host: string,
  port: number
): Promise<http.Server> {
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/sse') {
      try {
        const transport = new SSEServerTransport('/messages', res);
        sessions.set(transport.sessionId, transport);

        await mcpServer.connect(transport);

        // mcpServer.connect() assigns its own transport.onclose handler, so any
        // handler set before connect() is overwritten. Register session cleanup
        // afterward and chain to the SDK handler so the MCP server's own
        // teardown still runs. Without this the session is never removed from
        // the map on disconnect, leaking entries and making later POSTs to the
        // dead session return 500 instead of 404.
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
