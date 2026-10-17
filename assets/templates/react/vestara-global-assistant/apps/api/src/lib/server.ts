import { createServer } from 'node:http';
import { GlobalAssistant } from '@vestara/ai-core/global-assistant/global-assistant.js';
import { WebSocketServer } from 'ws';
import { createConversationRoutes } from '../routes/conversation.js';
export function createVestaraServer(db: any) {
  const assistant = new GlobalAssistant(db);
  const conversationRoutes = createConversationRoutes(db, assistant);
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname === '/api/conversation' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const result = await conversationRoutes.postConversation({
        body: JSON.parse(body || '{}'),
        user: { id: 'local-user' },
      });
      res.writeHead(result.status);
      res.end(JSON.stringify(result.body));
      return;
    }
    if (url.pathname === '/api/health') {
      const gates = await assistant.checkGates();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: { status: 'ok', gates, memory: 'persistent ./data/vestara.db' } }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  });
  const wss = new WebSocketServer({ server, path: '/ws/conversation' });
  wss.on('connection', (ws) => {
    conversationRoutes.handleWebSocket(ws);
  });
  return server;
}
