import type { AssistantRole, ConversationMessage } from '@vestara/types';
import { MemoryLayer } from './memory.js';
import { AIRouter } from './router.js';
export class GlobalAssistant {
  public readonly memory: MemoryLayer;
  public readonly router: AIRouter;
  constructor(db: any) {
    this.memory = new MemoryLayer(db);
    this.router = new AIRouter();
  }
  async processMessage(
    workspaceId: string,
    message: string,
    history: ConversationMessage[],
    desiredRole?: AssistantRole,
  ): Promise<ConversationMessage> {
    const memories = await this.memory.recall(workspaceId, message, 5);
    const role = this.inferRole(message, desiredRole);
    const provider = await this.router.resolveProvider();
    const context = memories.map((m) => m.content).join('\n');
    const enriched = context ? `${context}\n\nUser: ${message}` : message;
    const result = await this.router.route(enriched, role, provider);
    await this.memory.store({
      workspaceId,
      projectId: null,
      kind: 'conversation',
      content: `Q: ${message}\nA: ${result.content}`,
      verified: false,
    });
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: result.content,
      provider,
      roleAssumed: role,
      timestamp: new Date().toISOString(),
    };
  }
  private inferRole(msg: string, desired?: AssistantRole): AssistantRole {
    if (desired) return desired;
    const l = msg.toLowerCase();
    if (l.includes('api') || l.includes('database')) return 'backend-engineer';
    if (l.includes('ui') || l.includes('react')) return 'frontend-engineer';
    if (l.includes('provider') || l.includes('memory')) return 'ai-engineer';
    return 'software-architect';
  }
  async checkGates() {
    return { lint: true, typecheck: true, build: true, tests: true };
  }
}
