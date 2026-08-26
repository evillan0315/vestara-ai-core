/**
 * WFO-E2E-002B real-model provider adapter.
 *
 * The live adapter drives an `OpenCodeClient` from `@vestara/opencode-runtime`
 * (create a session per role, send the role prompt, read the structured reply).
 * Credentials resolve at invocation time and are never persisted or logged. A
 * missing credential or unreachable provider resolves to a controlled advisory
 * failure — never a crash, and never a secret leak.
 */

import { type OpenCodeClient, OpenCodeHttpClient, resolveOpenCodeConfig } from '@vestara/opencode-runtime';
import type { RealAgentRole } from './profile';

export interface TrialInvocationRequest {
  readonly role: RealAgentRole;
  readonly sessionId: string;
  readonly prompt: string;
  readonly promptTemplateVersion: string;
  readonly providerId: string;
  readonly modelId: string;
}

export interface TrialInvocationResult {
  readonly text: string;
  readonly sessionId: string;
  readonly providerStatus: 'completed' | 'failed' | 'unavailable';
  readonly error?: string;
}

export interface TrialModelProvider {
  readonly id: string;
  invoke(request: TrialInvocationRequest): Promise<TrialInvocationResult>;
}

/** Real provider adapter over the opencode-runtime client (opencode server). */
export class OpenCodeRuntimeTrialProvider implements TrialModelProvider {
  readonly id = 'opencode-runtime';
  private readonly sessions = new Map<string, string>();
  private readonly timeoutMs: number;

  constructor(
    private readonly client: OpenCodeClient,
    timeoutMs = 120_000,
  ) {
    this.timeoutMs = timeoutMs;
  }

  /** Build from environment via `resolveOpenCodeConfig` — throws when credentials are missing. */
  static fromEnv(): OpenCodeRuntimeTrialProvider {
    // Trial-specific timeout; OPENCODE_TIMEOUT is the server's own and is not
    // used here.
    const timeoutMs = Number(process.env.WFO_E2E_TIMEOUT_MS ?? 300_000) || 300_000;
    return new OpenCodeRuntimeTrialProvider(
      new OpenCodeHttpClient(resolveOpenCodeConfig({ requestTimeoutMs: timeoutMs })),
      timeoutMs,
    );
  }

  async invoke(request: TrialInvocationRequest): Promise<TrialInvocationResult> {
    const sessionId = await this.ensureSession(request);
    try {
      // Stream the assistant reply over the /event SSE endpoint: open the stream,
      // send asynchronously, accumulate message deltas for this session, and stop
      // on session.idle / session.error. This avoids racing a blocking poll.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const stream = this.client.openEventStream({ workspaceId: 'wfo-e2e', sessionId }, controller.signal);
      try {
        await this.client.sendMessageAsync(
          sessionId,
          { parts: [{ type: 'text', text: request.prompt }] },
          { workspaceId: 'wfo-e2e', sessionId },
        );
        let text = '';
        let terminal: 'idle' | 'error' | undefined;
        for await (const event of stream) {
          if (sessionOf(event) !== sessionId) continue;
          if (event.type === 'session.idle') {
            terminal = 'idle';
            break;
          }
          if (event.type === 'session.error' || event.type === 'session.unavailable') {
            terminal = 'error';
            break;
          }
          if (event.type.startsWith('message.') && typeof event.payload?.delta === 'string') {
            text += event.payload.delta;
          }
        }
        if (!text && terminal !== 'idle') {
          // Fall back to the persisted messages in case the reply had no deltas.
          text = await this.lastMessageText(sessionId);
        }
        if (!text) {
          return { text: '', sessionId, providerStatus: 'failed', error: 'no assistant reply within timeout' };
        }
        return {
          text,
          sessionId,
          providerStatus: terminal === 'error' ? 'failed' : 'completed',
          error: terminal === 'error' ? 'session error during reply' : undefined,
        };
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    } catch (error) {
      return {
        text: '',
        sessionId,
        providerStatus: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** One session per role — the Reviewer never shares a session with the Planner. */
  private async ensureSession(request: TrialInvocationRequest): Promise<string> {
    const existing = this.sessions.get(request.role);
    if (existing) return existing;
    const session = await this.client.createSession(
      {
        title: `wfo-e2e-002b-${request.role}`,
        agent: roleToAgent(request.role),
        model: { providerID: request.providerId, id: request.modelId },
      },
      { workspaceId: 'wfo-e2e' },
    );
    this.sessions.set(request.role, session.id);
    return session.id;
  }

  private async lastMessageText(sessionId: string): Promise<string> {
    const messages = await this.client.listMessages(sessionId, { workspaceId: 'wfo-e2e', sessionId });
    const last = [...messages].reverse().find((message) => message.role !== 'user' && message.text?.trim());
    return last?.text ?? '';
  }
}

function roleToAgent(role: string): string | undefined {
  switch (role) {
    case 'planner':
      return 'planner';
    case 'reviewer':
      return 'reviewer';
    default:
      return undefined;
  }
}

function sessionOf(event: { payload?: Record<string, unknown> }): string | undefined {
  const value = event.payload?.sessionID;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Simulates missing credentials or an unreachable provider: a controlled
 * advisory failure with no secret exposure, leaving the workflow recoverable.
 */
export class UnavailableTrialProvider implements TrialModelProvider {
  readonly id = 'unavailable';

  constructor(private readonly reason = 'provider or credential unavailable') {}

  async invoke(_request: TrialInvocationRequest): Promise<TrialInvocationResult> {
    return { text: '', sessionId: 'none', providerStatus: 'unavailable', error: this.reason };
  }
}
