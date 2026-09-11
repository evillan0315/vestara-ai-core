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
  /** Trusted turn-time surface context (GA-CONTEXT-002). Optional. */
  surfaceContext?: import('@vestara/shared').TurnSurfaceContext;
  /** OpenCode session ID for session reuse (GA-RUNTIME-001). */
  runtimeSessionId?: string;
  /**
   * GA-RUNTIME-001: requested upstream provider ID (browser selection).
   * Bounded server-side; never trusted as execution authority.
   */
  provider?: string;
  /** Caller-controlled cancellation: aborts the provider turn (GA-RUNTIME-001 cancel safety). */
  signal?: AbortSignal;
  /**
   * GA-EXEC-001: per-turn execution configuration. Passed through to the
   * CompletionRequest so the adapter can enforce Vestara-owned limits.
   */
  executionConfig?: import('@vestara/shared').GAExecutionConfig;
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

      // GA-CTX-001: include tool observations as structured context
      if (msg.role === 'assistant' && msg.toolObservations && msg.toolObservations.length > 0) {
        // GA-CTX-001: tool observations FIRST (what happened),
        // THEN the assistant's interpretation (what the model concluded).
        // This preserves semantic chronology: observation → interpretation.
        const obsSummary = msg.toolObservations
          .map((obs) => `[Tool: ${obs.toolName}] ${obs.status === 'completed' ? obs.content.slice(0, 500) : obs.status === 'failed' ? `FAILED: ${obs.error ?? obs.content.slice(0, 200)}` : 'denied'}`)
          .join('\n');
        if (obsSummary) {
          messages.push({
            role: 'user',
            content: `[Tool observations from previous turn]\n${obsSummary}`,
          });
        }
        // Then include the assistant's text response (interpretation of observations)
        if (msg.content) {
          messages.push({
            role: 'assistant',
            content: msg.content,
          });
        }
      } else {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
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
      // GA-RUNTIME-001: conversation identity for OpenCode session binding —
      // owned by the conversation runtime, never browser-supplied.
      conversationId: conversation.id,
      // GA-CONTEXT-002: trusted turn-time surface context (optional).
      ...(options.surfaceContext ? { surfaceContext: options.surfaceContext } : {}),
      // GA-RUNTIME-001: requested upstream provider (browser selection, bounded).
      ...(options.provider ? { provider: options.provider } : {}),
      // GA-RUNTIME-001: caller-controlled cancellation (client disconnect / stop).
      ...(options.signal ? { signal: options.signal } : {}),
      // Session reuse: pass the stored runtime session ID when available.
      ...(options.runtimeSessionId ? { runtimeSessionId: options.runtimeSessionId } : {}),
      // GA-EXEC-001: per-turn execution configuration (adapter enforcement).
      ...(options.executionConfig ? { executionConfig: options.executionConfig } : {}),
    };
  }
}
