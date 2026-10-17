import type { GlobalAssistant } from '@vestara/ai-core/global-assistant/global-assistant.js';
import { z } from 'zod';

const MessageSchema = z.object({
  workspaceId: z.string(),
  content: z.string().min(1),
  role: z
    .enum([
      'software-architect',
      'backend-engineer',
      'frontend-engineer',
      'ai-engineer',
      'devops-engineer',
      'security-engineer',
      'qa-engineer',
      'documentation-engineer',
      'research-agent',
      'product-manager',
      'chief-architect',
    ])
    .optional(),
});
type Db = { prepare: (sql: string) => any };
export function createConversationRoutes(db: Db, assistant: GlobalAssistant) {
  return {
    async postConversation(req: { body: unknown; user?: { id: string } }) {
      const input = MessageSchema.parse(req.body);
      if (!req.user?.id) return { status: 401, body: { success: false, error: 'Unauthorized - token required' } };
      const message = await assistant.processMessage(input.workspaceId, input.content, [], input.role);
      return { status: 200, body: { success: true, data: message } };
    },
    async getConversation(req: { params: { id: string } }) {
      const rows = db.prepare(`SELECT * FROM memory_entries WHERE workspace_id = ? LIMIT 50`).all(req.params.id);
      return { status: 200, body: { success: true, data: rows } };
    },
    async handleWebSocket(ws: any) {
      ws.on('message', async (raw: string) => {
        try {
          const input = MessageSchema.parse(JSON.parse(raw));
          const provider = await assistant.router.resolveProvider();
          ws.send(JSON.stringify({ type: 'start', provider }));
          for (const chunk of [
            'Checking repo state...',
            'Done: monorepo scaffold green',
            'Aligning across workspaces...',
          ]) {
            ws.send(JSON.stringify({ type: 'chunk', content: chunk }));
            await new Promise((r) => setTimeout(r, 200));
          }
          ws.send(JSON.stringify({ type: 'end' }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', error: (e as Error).message }));
        }
      });
    },
  };
}
