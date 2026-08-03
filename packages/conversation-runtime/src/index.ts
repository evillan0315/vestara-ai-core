/**
 * @vestara/conversation-runtime — Conversation Engine
 *
 * Wraps ConversationService with user profile enrichment and
 * session management. The core orchestrator for v4.0 Conversational
 * Onboarding.
 *
 * Architecture Traceability:
 *   PCS-020 → Conversational Onboarding
 *   UX-011  → Conversation Engine
 */

import type { ConversationService } from '@vestara/conversation';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { Runtime, type RuntimeId, type RuntimeType } from '@vestara/runtime';
import type {
  ConversationSession,
  ProviderRouterStatus,
  StreamChunk,
  UserProfile,
  UserProfileUpdate,
} from '@vestara/shared';
import type { ProviderRouter } from './provider/router';

const WELCOME_FIRST_BOOT = "Hello! I'm Vestara, your AI engineering companion. What's your name?";
const WELCOME_RETURNING = (name: string) =>
  `Welcome back, ${name}! You were working on your engineering workspace. Would you like to continue?`;

export interface UserProfileStore {
  load(): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  update(id: string, update: UserProfileUpdate): Promise<UserProfile>;
  delete(id: string): Promise<void>;
}

export interface ConversationSessionStore {
  save(session: ConversationSession): Promise<void>;
  load(id: string): Promise<ConversationSession | null>;
  listRecent(userId: string, limit?: number): Promise<ConversationSession[]>;
  delete(id: string): Promise<void>;
}

export interface ConversationEngineOptions {
  conversationService: ConversationService;
  profileStore: UserProfileStore;
  sessionStore: ConversationSessionStore;
  providerRouter?: ProviderRouter;
  eventBus?: EventBus;
  logger?: Logger;
}

export class DefaultConversationEngine extends Runtime {
  readonly componentId = 'vestara-conversation';
  private conversationService: ConversationService;
  private profileStore: UserProfileStore;
  private sessionStore: ConversationSessionStore;
  private providerRouter?: ProviderRouter;
  private eventBus?: EventBus;
  private logger?: Logger;
  private _profile: UserProfile | null = null;
  private _session: ConversationSession | null = null;
  private _conversationId: string | null = null;

  constructor(options: ConversationEngineOptions) {
    const runtimeId = `conversation:${Date.now()}` as unknown as RuntimeId;
    super({
      id: runtimeId,
      type: 'runtime' as RuntimeType,
      name: 'Conversation Engine',
      eventBus: options.eventBus,
    });

    this.conversationService = options.conversationService;
    this.profileStore = options.profileStore;
    this.sessionStore = options.sessionStore;
    this.providerRouter = options.providerRouter;
    this.eventBus = options.eventBus;
    this.logger = options.logger?.child({ component: 'conversation-engine' });
  }

  get status() {
    return this.state === 'running' ? 'ready' : this.state === 'failed' ? 'unavailable' : 'degraded';
  }

  get profile(): UserProfile | null {
    return this._profile;
  }

  get session(): ConversationSession | null {
    return this._session;
  }

  async initialize(): Promise<void> {
    try {
      this._profile = await this.profileStore.load();
      this.logger?.info('Conversation engine initialized', {
        hasProfile: !!this._profile,
        profileName: this._profile?.name,
      });
    } catch (error) {
      this.logger?.error('Failed to initialize conversation engine', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      if (this.state === 'created') {
        await super.initialize();
      }
      return;
    }
    await super.initialize();
  }

  async getGreeting(): Promise<string> {
    if (this._profile?.name) {
      return WELCOME_RETURNING(this._profile.name);
    }
    return WELCOME_FIRST_BOOT;
  }

  async getRouterStatus(): Promise<ProviderRouterStatus | null> {
    if (!this.providerRouter) return null;
    return this.providerRouter.getStatus();
  }

  get isFirstBoot(): boolean {
    return !this._profile;
  }

  async startSession(userId = 'local'): Promise<ConversationSession> {
    const conversation = await this.conversationService.createConversation(userId);
    this._conversationId = conversation.id;

    const now = new Date().toISOString();
    this._session = {
      id: conversation.id,
      userId,
      profileId: this._profile?.id ?? 'pending',
      startedAt: now,
      transcript: [],
      audioTimeline: [],
      context: {},
      referencedArtifacts: [],
      summaries: [],
      actions: [],
      memoryUpdates: [],
    };

    await this.sessionStore.save(this._session);

    await this.eventBus?.emit({
      type: 'conversation:session.started',
      source: 'conversation-engine',
      payload: {
        sessionId: this._session.id,
        userId,
        profileId: this._profile?.id,
        isFirstBoot: this.isFirstBoot,
      },
      metadata: { correlationId: this._session.id },
    });

    this.logger?.info('Session started', { sessionId: this._session.id, isFirstBoot: this.isFirstBoot });
    return this._session;
  }

  async sendMessage(
    content: string,
    options?: { model?: string },
  ): Promise<{ response: string; profile: UserProfile; session: ConversationSession }> {
    if (!this._conversationId) throw new Error('No active session. Call startSession() first.');

    const result = await this.conversationService.sendMessage(this._conversationId, content, options);

    if (this._session) {
      const _lastMsg = this._session.transcript.length;
      this._session.transcript.push(result.message);
      this._session.transcript.push(result.response);
      this._session.context.lastExchange = {
        user: content,
        response: result.response.content,
        timestamp: new Date().toISOString(),
      };

      this._profile = await this._enrichProfile(content, result.response.content);
    }

    await this.eventBus?.emit({
      type: 'conversation:exchange.completed',
      source: 'conversation-engine',
      payload: {
        sessionId: this._session?.id,
        contentLength: content.length,
        responseLength: result.response.content.length,
        latency: result.latency,
      },
      metadata: { correlationId: this._conversationId },
    });

    return {
      response: result.response.content,
      profile: this._profile!,
      session: this._session!,
    };
  }

  async *sendMessageStream(content: string, options?: { model?: string }): AsyncIterable<StreamChunk> {
    if (!this._conversationId) throw new Error('No active session. Call startSession() first.');

    let fullResponse = '';
    for await (const chunk of this.conversationService.sendMessageStream(this._conversationId, content, options)) {
      if (chunk.type === 'text' && chunk.content) {
        fullResponse += chunk.content;
      }
      yield chunk;
    }

    if (this._session) {
      this._session.context.lastExchange = {
        user: content,
        response: fullResponse,
        timestamp: new Date().toISOString(),
      };

      this._profile = await this._enrichProfile(content, fullResponse);
    }
  }

  async getProfile(): Promise<UserProfile | null> {
    return this._profile;
  }

  async updateProfile(update: UserProfileUpdate): Promise<UserProfile> {
    if (!this._profile) throw new Error('No profile exists yet. Create one first.');

    this._profile = {
      ...this._profile,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    await this.profileStore.save(this._profile);
    return this._profile;
  }

  async endSession(): Promise<void> {
    if (this._session) {
      this._session.endedAt = new Date().toISOString();
      await this.sessionStore.save(this._session);

      if (this._profile) {
        this._profile.lastSessionId = this._session.id;
        this._profile.conversationCount++;
        await this.profileStore.save(this._profile);
      }

      if (this._conversationId) {
        await this.conversationService.closeConversation(this._conversationId);
      }
    }

    await this.eventBus?.emit({
      type: 'conversation:session.ended',
      source: 'conversation-engine',
      payload: { sessionId: this._session?.id },
      metadata: { correlationId: this._session?.id ?? 'unknown' },
    });

    this._session = null;
    this._conversationId = null;
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    const engineHealthy = this.state === 'running' || this.state === 'initializing';
    const latency = Math.round(performance.now() - start);
    return {
      status: engineHealthy ? 'healthy' : 'degraded',
      latency,
    };
  }

  private async _enrichProfile(userMessage: string, _aiResponse: string): Promise<UserProfile> {
    if (!this._profile) {
      const name = _extractName(userMessage);
      const role = _extractRole(userMessage);

      const profile: UserProfile = {
        id: `profile-${Date.now()}`,
        name: name ?? undefined,
        role: role ?? undefined,
        preferredStack: _extractStack(userMessage),
        communicationStyle: 'balanced',
        preferences: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conversationCount: 0,
      };

      this._profile = profile;
      await this.profileStore.save(profile);

      await this.eventBus?.emit({
        type: 'user:profile.created',
        source: 'conversation-engine',
        payload: {
          userId: this._session?.userId ?? 'local',
          userName: profile.name ?? 'Unknown',
          profileId: profile.id,
        },
        metadata: { correlationId: this._session?.id ?? 'unknown' },
      });

      return profile;
    }

    const role = _extractRole(userMessage);
    const stack = _extractStack(userMessage);
    const goals = _extractGoals(userMessage);

    const update: UserProfileUpdate = {};
    if (role) update.role = role;
    if (stack && stack.length > 0) {
      update.preferredStack = [...new Set([...(this._profile.preferredStack ?? []), ...stack])];
    }
    if (goals && goals.length > 0) {
      update.goals = [...new Set([...(this._profile.goals ?? []), ...goals])];
    }

    if (Object.keys(update).length > 0) {
      const result = await this.updateProfile(update);

      await this.eventBus?.emit({
        type: 'user:profile.updated',
        source: 'conversation-engine',
        payload: {
          userId: this._session?.userId ?? 'local',
          userName: result.name ?? 'Unknown',
          profileId: result.id,
          field: Object.keys(update).join(', '),
        },
        metadata: { correlationId: this._session?.id ?? 'unknown' },
      });

      return result;
    }

    return this._profile;
  }
}

function _extractName(message: string): string | null {
  const patterns = [/my name is (\w+)/i, /i['"]?m (\w+)/i, /call me (\w+)/i, /name['"]?s (\w+)/i, /^(\w+)$/i];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 1 && match[1].length <= 30) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
  }
  return null;
}

function _extractRole(message: string): string | null {
  const patterns = [
    /(?:a|an|am) (\w+(?:\s+\w+){0,3}) (?:engineer|developer|designer|architect|manager|lead|intern|contractor|freelancer)/i,
    /(?:i['"]?m|i am) (?:\w+\s+)*(?:engineer|developer|designer|architect|manager|lead)/i,
    /work as (?:\w+\s+)*(?:engineer|developer|designer|architect)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[0].replace(/^(a|an|am|i'm|i am)\s+/i, '').trim();
  }
  return null;
}

function _extractStack(message: string): string[] {
  const knownLanguages = [
    'typescript',
    'javascript',
    'python',
    'rust',
    'go',
    'java',
    'kotlin',
    'swift',
    'c#',
    'c++',
    'c',
    'ruby',
    'php',
    'scala',
    'elixir',
    'haskell',
    'clojure',
    'dart',
    'lua',
    'zig',
    'nim',
    'ocaml',
    'erb',
  ];
  const found: string[] = [];
  for (const lang of knownLanguages) {
    const escaped = lang.replace(/[+#]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(message)) {
      found.push(lang.charAt(0).toUpperCase() + lang.slice(1));
    }
  }
  return found;
}

function _extractGoals(message: string): string[] {
  const patterns = [
    /(?:want to|going to|plan to|need to|would like to) ([\w\s]+)/i,
    /(?:goal|objective|aim) (?:is|:) ([\w\s]+)/i,
    /(?:build|create|make|develop) (?:a|an|the) ([\w\s]+)/i,
  ];
  const goals: string[] = [];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1].trim().length > 3) {
      goals.push(match[1].trim().toLowerCase());
    }
  }
  return goals;
}

export type { AuditIssue, ConversationAuditReport, ConversationPackage } from './audit/scanner';
export { ConversationScanner } from './audit/scanner';
export { SqliteConversationStore } from './conversation-store';
export type {
  GeminiConfig,
  OllamaConfig,
  OpenAICompatConfig,
  OpenCodeConfig,
  ProviderConfig,
  ProviderKind,
} from './provider';
export { GeminiProvider, OllamaProvider, OpenCodeProvider, ProviderFactory } from './provider';
export { LocalProvider } from './provider/local';
export { OpenAICompatibleProvider } from './provider/openai-compat';
export { OpenCodeCloudProvider } from './provider/opencode-adapter';
export { ProviderRouter } from './provider/router';
export { SqliteConversationSessionStore } from './session-store';
export { SqliteUserProfileStore } from './user-profile-store';
