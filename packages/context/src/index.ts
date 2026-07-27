/**
 * @vestara/context — Context Assembler
 *
 * Builds the AI request context from system prompt, conversation
 * history, and the current user message. Intentionally simple for
 * v0.1 — memory and knowledge retrieval will be layered in later
 * without changing this interface.
 *
 * Architecture Traceability:
 *   Specification: CAP-001 → Context Assembly
 *   Foundation: VOM-Context
 */

import type { CompletionRequest, Conversation } from '@vestara/shared';

export interface ContextOptions {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ContextAssembler {
  buildContext(conversation: Conversation, userMessage: string, options?: ContextOptions): CompletionRequest;
}

export class DefaultContextAssembler implements ContextAssembler {
  private defaultSystemPrompt: string;

  constructor(systemPrompt?: string) {
    this.defaultSystemPrompt =
      systemPrompt ??
      'You are Vestara, an AI assistant that helps users build software. ' +
        'You are helpful, concise, and precise. You can read files and execute ' +
        'commands when given permission. You remember context across messages.';
  }

  buildContext(conversation: Conversation, userMessage: string, options: ContextOptions = {}): CompletionRequest {
    const messages: CompletionRequest['messages'] = [];

    // System prompt
    messages.push({
      role: 'system',
      content: options.systemPrompt ?? this.defaultSystemPrompt,
    });

    // Conversation history (last 20 messages to stay within context window)
    const recentMessages = conversation.messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === 'system') continue; // Don't duplicate system message
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // Current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return {
      model: options.model ?? 'deepseek-v4-flash-free',
      messages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 2048,
    };
  }
}
