import type { MemoryRuntime } from '@vestara/memory';
import type { ContextContribution, ContextSource } from './context-assembler';

export class MemoryContextSource implements ContextSource {
  readonly name = 'memory';
  private readonly memory: MemoryRuntime;

  constructor(memory: MemoryRuntime) {
    this.memory = memory;
  }

  async contribute(
    _request: string,
    workspaceName: string,
    _workspacePath: string,
    userId: string,
  ): Promise<ContextContribution> {
    const stored = await this.memory.search(userId, `workspace:${workspaceName}`);
    const decisions = stored.memories.filter((m) => m.type === 'decision');
    const summaries = stored.memories.filter((m) => m.type === 'event');

    return {
      architectureDecisions: decisions.map((d) => d.content),
      repositorySummary: this.extractSummary(summaries),
      outstandingWork: this.extractOutstanding(summaries),
      conversationSummary: summaries
        .map((s) => s.content)
        .join('\n')
        .slice(0, 500),
    };
  }

  async saveDecision(userId: string, workspaceName: string, decision: string): Promise<void> {
    await this.memory.store(userId, {
      type: 'decision',
      content: decision,
      tags: ['architecture', workspaceName],
      source: 'planner',
    });
  }

  private extractSummary(summaries: { content: string }[]): string {
    const state = summaries.find((s) => s.content.includes('workspace status'));
    return state?.content ?? '';
  }

  private extractOutstanding(summaries: { content: string }[]): string[] {
    return summaries.filter((s) => s.content.includes('next:')).map((s) => s.content.replace(/^next:\s*/i, ''));
  }
}

export type { ContextContribution, ContextSource } from './context-assembler';
export { ContextAssembler } from './context-assembler';
