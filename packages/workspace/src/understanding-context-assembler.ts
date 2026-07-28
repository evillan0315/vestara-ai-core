/**
 * UnderstandingContextAssembler — injects workspace understanding
 * into the conversation system prompt.
 *
 * Replaces the static DefaultContextAssembler once understanding
 * is available. Every conversation receives the same semantic
 * view of the workspace — guaranteed by sharing the same
 * WorkspaceUnderstanding snapshot.
 */

import type { CompletionRequest, Conversation } from '@vestara/shared';
import type { ContextAssembler, ContextOptions } from '@vestara/context';
import type { WorkspaceUnderstanding } from '@vestara/understanding';

export class UnderstandingContextAssembler implements ContextAssembler {
  private understanding: WorkspaceUnderstanding | null;
  private fallbackPrompt: string;

  constructor(understanding: WorkspaceUnderstanding | null, fallbackPrompt?: string) {
    this.understanding = understanding;
    this.fallbackPrompt = fallbackPrompt ?? 'You are Vestara, an AI assistant that helps users build software.';
  }

  setUnderstanding(understanding: WorkspaceUnderstanding): void {
    this.understanding = understanding;
  }

  buildContext(conversation: Conversation, userMessage: string, options: ContextOptions = {}): CompletionRequest {
    const messages: CompletionRequest['messages'] = [];

    const systemPrompt = options.systemPrompt ?? this.buildSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    const recentMessages = conversation.messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === 'system') continue;
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    return {
      model: options.model ?? 'deepseek-v4-flash-free',
      messages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 2048,
    };
  }

  private buildSystemPrompt(): string {
    const u = this.understanding;
    if (!u) return this.fallbackPrompt;

    const parts: string[] = [
      `You are Vestara, working in the "${u.identity.name}" repository.`,
      '',
    ];

    parts.push(`Repository: ${u.identity.name}`);
    parts.push(`Primary language: ${u.identity.primaryLanguage}`);
    if (u.identity.framework) parts.push(`Framework: ${u.identity.framework}`);
    parts.push(`Architecture: ${u.architecture.kind}`);
    parts.push(`Health: ${u.maturity.healthScore.toFixed(1)}/10 (${u.maturity.level})`);

    if (u.maturity.risks.length > 0) {
      parts.push('');
      parts.push('Detected risks:');
      for (const risk of u.maturity.risks) {
        parts.push(`  [${risk.severity}] ${risk.summary}`);
      }
    }

    if (u.activity.recentChanges.length > 0) {
      parts.push('');
      parts.push('Recent activity:');
      const recent = u.activity.recentChanges.slice(0, 3);
      for (const change of recent) {
        parts.push(`  - ${change.description}`);
      }
    }

    if (u.activity.uncommittedWork) {
      parts.push('');
      parts.push('There are uncommitted changes in the workspace.');
    }

    if (u.memory.recentDecisions.length > 0) {
      parts.push('');
      parts.push('Recent decisions:');
      for (const d of u.memory.recentDecisions.slice(0, 3)) {
        parts.push(`  - ${d.title}`);
      }
    }

    parts.push('');
    parts.push('You help the user understand, navigate, and improve this repository.');
    parts.push('You are concise and precise. Use the workspace context above to inform your responses.');

    return parts.join('\n');
  }
}
