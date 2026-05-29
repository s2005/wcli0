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

        transport.onclose = () => {
          sessions.delete(transport.sessionId);
          debugLog(`SSE session closed: ${transport.sessionId}`);
        };

        await transport.start();
        await mcpServer.connect(transport);
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
  return new Promise((resolve, reject) => {
    if (!server.listening) {
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
  });
}
