/**
 * Telegram Webhook Route
 *
 * Handles incoming Telegram webhooks, normalizes them to canonical types,
 * routes through the Global Assistant text router, and returns the result.
 *
 * Endpoints:
 *   POST /api/telegram/webhook        — Receive Telegram updates (from real bot)
 *   POST /api/telegram/simulate       — Simulate a Telegram message (testing)
 *   POST /api/telegram/pairing        — Create pairing request
 *   POST /api/telegram/pairing/approve — Approve pairing with token
 *   POST /api/telegram/enroll         — Explicitly bind an existing pairing
 *   GET  /api/telegram/bindings       — List all bindings (diagnostic)
 *   GET  /api/telegram/chats          — Linked chats for the forward picker
 *   POST /api/telegram/forward        — Forward an Activity Room message to Telegram
 *   GET  /api/telegram/status         — Get Telegram integration status
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform
 */

import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import type { ChannelMessage, ConversationBinding, ProjectedQuestion, StreamSink } from '@vestara/telegram-integration';
import {
  type CommandContext,
  cloudflaredArgs,
  DEFAULT_TUNNEL_CONFIG,
  GlobalAssistantTextRouter,
  isCommandAvailable,
  NOTIFICATION_EVENT_CATALOG,
  ngrokArgs,
  normalizeNotificationPreferences,
  ProcessTunnelProvider,
  StaticTunnelProvider,
  TELEGRAM_ASSISTANT_AGENT_ID,
  TELEGRAM_MANIFEST,
  TelegramAdapter,
  TelegramCommandRegistry,
  TelegramConversationBindingService,
  TelegramNotificationPolicy,
  TelegramPairingService,
  TelegramPersistentStore,
  TelegramTunnelService,
  TelegramWebhookHandler,
  type TelegramWebhookRegistrar,
  TelegramWorkspaceBindingService,
  type TunnelConfig,
  type TunnelProvider,
  type TunnelProviderKind,
  waitForHostResolution,
} from '@vestara/telegram-integration';
import { resolveAssistantIdentity } from '../assistant-identity';
import { authenticate, requireRole } from '../auth';
import {
  createTelegramPairingInteractionBridge,
  presentTelegramPairingApproval,
} from '../bridges/telegram-pairing-interaction-bridge';
import { enrollTelegramIdentity, resolveTelegramIdentity } from '../telegram-identity';
import {
  answerQuestionByText,
  dispatchQuestionTap,
  forwardAssistantQuestion,
  type QuestionResolution,
  type TrackedQuestion,
} from '../telegram-question-bridge';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

// ─── State ─────────────────────────────────────────────────────

let webhookHandler: TelegramWebhookHandler | null = null;
let pairingService: TelegramPairingService | null = null;
let workspaceBindingService: TelegramWorkspaceBindingService | null = null;
let conversationBindingService: TelegramConversationBindingService | null = null;
let textRouter: GlobalAssistantTextRouter | null = null;
let store: TelegramPersistentStore | null = null;
let workspaceContext: WorkspaceContext | null = null;
let pairingInteractionBridge: { dispose: () => void } | null = null;

/** Settings key for the operator-scoped notification preferences (TG-018/023). */
const NOTIFICATION_SETTINGS_KEY = 'notifications:default';

/** Settings key for the persisted webhook tunnel configuration. */
const TUNNEL_SETTINGS_KEY = 'tunnel:default';

const notificationPolicy = new TelegramNotificationPolicy();

// ─── Tunnel (TG-030) ───────────────────────────────────────────

const TUNNEL_PROVIDER_KINDS: readonly TunnelProviderKind[] = ['manual', 'cloudflared', 'ngrok'];

function resolveTunnelProviderOverride(): TunnelProviderKind | undefined {
  const raw = process.env.VESTARA_TELEGRAM_TUNNEL_PROVIDER?.trim().toLowerCase();
  return TUNNEL_PROVIDER_KINDS.includes(raw as TunnelProviderKind) ? (raw as TunnelProviderKind) : undefined;
}

function initialTunnelConfig(): TunnelConfig {
  return {
    ...DEFAULT_TUNNEL_CONFIG,
    provider: resolveTunnelProviderOverride() ?? DEFAULT_TUNNEL_CONFIG.provider,
    localPort: Number(process.env.VESTARA_API_PORT ?? process.env.PORT ?? 3001),
  };
}

/**
 * Whether a tunnel should auto-enable on API boot / systemd restart.
 * Default ON — opt out with `VESTARA_TELEGRAM_TUNNEL_AUTOSTART=0|false`.
 * Manual-provider tunnels never autostart (no process to spawn, and an
 * empty publicUrl would only fail).
 */
export function shouldAutoEnableTunnel(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.VESTARA_TELEGRAM_TUNNEL_AUTOSTART?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return true;
}

let tunnelConfig: TunnelConfig = initialTunnelConfig();
let tunnelService: TelegramTunnelService | null = null;

/** Effective command for a process-backed provider (env override wins). */
function resolveTunnelCommand(kind: TunnelProviderKind): string {
  const envCommand = process.env.VESTARA_TELEGRAM_TUNNEL_COMMAND;
  return envCommand && envCommand.trim().length > 0 ? envCommand.trim() : kind;
}

/**
 * Build a tunnel provider for a kind. The command and argument list come from
 * environment configuration, never from request input, so a request can only
 * choose a known provider kind — it can never influence process execution.
 */
function createTunnelProvider(kind: TunnelProviderKind): TunnelProvider | null {
  if (kind === 'manual') {
    return new StaticTunnelProvider('manual', tunnelConfig.publicUrl ?? '');
  }

  const command = resolveTunnelCommand(kind);
  const envArgs = process.env.VESTARA_TELEGRAM_TUNNEL_ARGS;
  const args =
    envArgs && envArgs.trim().length > 0
      ? envArgs.trim().split(/\s+/)
      : kind === 'cloudflared'
        ? [...cloudflaredArgs()]
        : [...ngrokArgs()];

  return new ProcessTunnelProvider(kind, { kind, command, args });
}

export type TunnelAvailability = Record<TunnelProviderKind, boolean>;

const AVAILABILITY_TTL_MS = 30_000;
let availabilityCache: { at: number; value: TunnelAvailability } | null = null;

/**
 * Probe which process-backed tunnel providers are actually installed. Results
 * are cached briefly so a polling Settings page cannot spawn a probe per
 * request. `manual` is always available — it needs no local binary.
 */
export async function resolveTunnelAvailability(now: number = Date.now()): Promise<TunnelAvailability> {
  if (availabilityCache && now - availabilityCache.at < AVAILABILITY_TTL_MS) {
    return availabilityCache.value;
  }
  const [cloudflared, ngrok] = await Promise.all([
    isCommandAvailable(resolveTunnelCommand('cloudflared')),
    isCommandAvailable(resolveTunnelCommand('ngrok')),
  ]);
  const value: TunnelAvailability = { manual: true, cloudflared, ngrok };
  availabilityCache = { at: now, value };
  return value;
}

/** Telegram Bot API webhook registrar. Absent when no bot token is configured. */
function createWebhookRegistrar(): TelegramWebhookRegistrar | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  const call = async (method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { ok?: boolean; description?: string };
      return data.ok ? { ok: true } : { ok: false, error: data.description ?? `${method} failed` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `${method} failed` };
    }
  };

  /**
   * Register with bounded retries. Telegram may transiently fail URL
   * validation while a tunnel hostname propagates, and a failed registration
   * is cheap to repeat — unlike a poisoned hostname.
   */
  const registerWithRetry = async (url: string): Promise<{ ok: boolean; error?: string }> => {
    const attempts = 3;
    let last: { ok: boolean; error?: string } = { ok: false, error: 'setWebhook failed' };
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      last = await call('setWebhook', secret ? { url, secret_token: secret } : { url });
      if (last.ok) return last;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
    return last;
  };

  return {
    register: (url) => registerWithRetry(url),
    unregister: () => call('deleteWebhook', { drop_pending_updates: false }),
  };
}

function getTunnelService(): TelegramTunnelService {
  if (!tunnelService) {
    tunnelService = new TelegramTunnelService({
      config: tunnelConfig,
      providerFactory: createTunnelProvider,
      registrar: createWebhookRegistrar(),
      // Never register a webhook before Telegram can resolve the host: an
      // NXDOMAIN seen early is cached and poisons the hostname permanently.
      readinessProbe: async (publicUrl) => {
        try {
          return await waitForHostResolution(new URL(publicUrl).hostname, { timeoutMs: 20_000, intervalMs: 1_000 });
        } catch {
          return false;
        }
      },
    });
  }
  return tunnelService;
}

/**
 * TG-027: single source of truth for whether Telegram is active in a runtime
 * profile. The dogfood profile parks Telegram; every other profile (including
 * the `full` default) activates it. Both the boot gate and the settings read
 * model consume this so they can never disagree.
 */
export function resolveTelegramActivation(runtimeProfile: string | undefined): {
  enabled: boolean;
  profile: string;
} {
  const profile = runtimeProfile ?? 'full';
  return { enabled: profile !== 'dogfood', profile };
}

function getWebhookHandler(): TelegramWebhookHandler {
  if (!webhookHandler) {
    webhookHandler = new TelegramWebhookHandler({
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    });
  }
  return webhookHandler;
}

/**
 * Flush the in-memory sql.js Telegram database to `telegram.db` after every
 * mutation. Previously persistence only ran inside `migrate()` at boot, so
 * pairing approvals and bindings lived only in memory until the next restart.
 * Best-effort: a failed flush must never fail the mutation (Telegram db is
 * ~100KB; human-scale write frequency).
 */
function persistTelegramDb(db: any, dbPath: string): void {
  try {
    const data = db.export();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch {
    /* best-effort */
  }
}

// Exported for unit tests (TG-031 mirror coverage) — the HTTP surface is unchanged.
export function getPairingService(): TelegramPairingService {
  if (!pairingService) {
    pairingService = new TelegramPairingService({ store: store ?? undefined });
  }
  return pairingService;
}

function getWorkspaceBindingService(): TelegramWorkspaceBindingService {
  if (!workspaceBindingService) {
    workspaceBindingService = new TelegramWorkspaceBindingService({ store: store ?? undefined });
  }
  return workspaceBindingService;
}

/** Re-read workspace state using the canonical principal, never the pairing ID. */
export function rereadCanonicalWorkspace(
  bindings: Pick<TelegramWorkspaceBindingService, 'getPreferredWorkspace'>,
  canonicalPrincipalId: string,
) {
  return bindings.getPreferredWorkspace(canonicalPrincipalId);
}

function getConversationBindingService(): TelegramConversationBindingService {
  if (!conversationBindingService) {
    conversationBindingService = new TelegramConversationBindingService({ store: store ?? undefined });
  }
  return conversationBindingService;
}

/**
 * ROUTING-CONVERGENCE-001A: resolve the Telegram target agent's canonical
 * execution binding per turn from the live AgentDefinition — the same
 * authority the Activity Room reads in `triggerAssistantTurn`. Telegram
 * asserts target-agent identity only and never supplies provider/model
 * itself: when the definition carries a complete binding it is propagated;
 * otherwise the request carries identity only and the canonical
 * `AssistantBindingResolver` fallback governs (fail-closed on error).
 */
export interface TelegramAgentBinding {
  readonly agentId: string;
  readonly provider?: string;
  readonly model?: string;
}

export async function resolveTelegramAgentBinding(
  agents: Pick<WorkspaceContext, 'agents'>['agents'],
  agentId: string = TELEGRAM_ASSISTANT_AGENT_ID,
): Promise<TelegramAgentBinding> {
  try {
    const agent = await agents.getAgent(agentId);
    if (
      agent &&
      typeof agent.provider === 'string' &&
      agent.provider.length > 0 &&
      typeof agent.model === 'string' &&
      agent.model.length > 0
    ) {
      return { agentId, provider: agent.provider, model: agent.model };
    }
  } catch {
    /* fall through to identity-only — the canonical fallback governs */
  }
  return { agentId };
}

/**
 * Get or create the text router with an ExecutionBackend wired to the
 * conversation service. The backend is created lazily so the workspace
 * context is available, and re-created if the context rotates so turns
 * never execute against a stale workspace.
 */
let textRouterCtx: WorkspaceContext | null = null;
function getTextRouter(ctx: WorkspaceContext): GlobalAssistantTextRouter | null {
  if (!textRouter || textRouterCtx !== ctx) {
    textRouterCtx = ctx;
    textRouter = new GlobalAssistantTextRouter({
      backend: {
        sendMessage: async (conversationId, content, options) => {
          // Per-turn canonical binding: the SAME live AgentDefinition read
          // the Activity Room performs. No Telegram-local model authority.
          const binding = await resolveTelegramAgentBinding(ctx.agents, options?.agentId);
          const assistantIdentity = await resolveAssistantIdentity(ctx, options?.actor);
          const result = await ctx.conversationService.sendMessage(conversationId, content, {
            agentId: binding.agentId,
            ...(options?.actor ? { actor: options.actor } : {}),
            ...(assistantIdentity ? { assistantIdentity } : {}),
            ...(binding.provider ? { provider: binding.provider } : {}),
            ...(binding.model ? { model: binding.model } : {}),
          });
          return {
            executionId: `tg-exec-${Date.now()}`,
            success: true,
            response: result.response.content,
            tokensUsed: result.response.tokens,
            completedAt: new Date().toISOString(),
          };
        },
        // VES-TG-STREAM: token deltas for live Telegram edits. Same
        // per-turn canonical binding as sendMessage — identity only on the
        // channel, provider/model resolved server-side per turn.
        streamMessage: async function* (conversationId, content, options) {
          const binding = await resolveTelegramAgentBinding(ctx.agents, options?.agentId);
          const assistantIdentity = await resolveAssistantIdentity(ctx, options?.actor);
          const stream = ctx.conversationService.sendMessageStream(conversationId, content, {
            agentId: binding.agentId,
            ...(options?.actor ? { actor: options.actor } : {}),
            ...(assistantIdentity ? { assistantIdentity } : {}),
            ...(binding.provider ? { provider: binding.provider } : {}),
            ...(binding.model ? { model: binding.model } : {}),
          });
          for await (const chunk of stream) {
            if (chunk.type === 'text' && chunk.content) yield chunk.content;
          }
        },
      },
    });
  }
  return textRouter;
}

// ─── Init ──────────────────────────────────────────────────────

export async function initTelegramRoute(dbPath: string, ctx: WorkspaceContext): Promise<void> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();

  workspaceContext = ctx;

  let db: any;
  try {
    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
    }
  } catch {
    /* corrupt or unreadable — start fresh */
  }
  db = db ?? new SQL.Database();

  migrate(db, TELEGRAM_MANIFEST, {
    persist: (migrated) => {
      const data = migrated.export();
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, Buffer.from(data));
    },
  });

  store = new TelegramPersistentStore(db, {
    persist: () => persistTelegramDb(db, dbPath),
  });

  // Rehydrate operator notification preferences (TG-018/023).
  const storedNotifications = store.getSettings(NOTIFICATION_SETTINGS_KEY);
  if (storedNotifications !== undefined) {
    notificationPolicy.setPreferences('default', storedNotifications);
  }

  // Rehydrate tunnel configuration (TG-030). `cloudflared` is the default;
  // a non-manual tunnel auto-enables on boot so systemd start/reload brings
  // the live tunnel up without opening Settings. Autostart is best-effort
  // and never fails boot — failures surface on GET /api/telegram/tunnel.
  const storedTunnel = store.getSettings(TUNNEL_SETTINGS_KEY) as Partial<TunnelConfig> | undefined;
  if (storedTunnel !== undefined) {
    tunnelConfig = { ...initialTunnelConfig(), ...storedTunnel };
  }
  const providerOverride = resolveTunnelProviderOverride();
  if (providerOverride !== undefined) {
    tunnelConfig = { ...tunnelConfig, provider: providerOverride };
  }
  tunnelService = null;

  // Re-initialize services with the persistent store
  webhookHandler = null;
  pairingService = new TelegramPairingService({ store });
  workspaceBindingService = new TelegramWorkspaceBindingService({ store });
  conversationBindingService = new TelegramConversationBindingService({ store });
  textRouter = null; // will be recreated with backend on first use

  // One-click pairing approval in the Activity Room: every /pair request is
  // presented as an Approve/Reject interaction. Best-effort — never fails boot.
  try {
    pairingInteractionBridge?.dispose();
    pairingInteractionBridge = createTelegramPairingInteractionBridge({
      eventBus: ctx.eventBus,
      interactionService: ctx.interactionService,
      pairing: pairingService,
      principals: ctx.humanPrincipals,
      mirror: (text) => {
        void mirrorTelegramReplyToActivityRoom(text);
      },
    });
  } catch (error) {
    console.warn('[telegram] pairing approval bridge failed', error instanceof Error ? error.message : error);
  }

  console.log('[telegram] route initialized with persistent store');

  // Auto-enable the live tunnel on API start / systemd reload. Fire-and-
  // forget: boot must never block on tunnel DNS/propagation, and a missing
  // cloudflared binary or bot token just leaves state `disabled`/`error`.
  if (shouldAutoEnableTunnel() && tunnelConfig.provider !== 'manual') {
    void getTunnelService()
      .enable()
      .then((state) => {
        console.log(
          `[telegram] tunnel autostart provider=${tunnelConfig.provider} status=${state.status}${state.publicUrl ? ` url=${state.publicUrl}` : ''}${state.lastError ? ` error=${state.lastError}` : ''}`,
        );
      })
      .catch((error) => {
        console.warn('[telegram] tunnel autostart failed', error instanceof Error ? error.message : error);
      });
  }
}

// ─── Message Processing ────────────────────────────────────────

/** Telegram Bot API text limit per message. */
const TELEGRAM_MAX_TEXT_LENGTH = 4096;
/** Chunk target below the limit, leaving room for formatting. */
const TELEGRAM_CHUNK_TARGET = 4000;

/**
 * Split long text into Telegram-sized chunks, preferring newline
 * boundaries. Pure — safe to unit test.
 */
export function splitTelegramText(text: string, target: number = TELEGRAM_CHUNK_TARGET): string[] {
  if (text.length <= TELEGRAM_MAX_TEXT_LENGTH) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= TELEGRAM_MAX_TEXT_LENGTH) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf('\n', target);
    if (cut <= 0) cut = target;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
    if (chunks.length > 10) {
      // Absolute bound: never spam the Bot API on pathological input.
      chunks.push('… (truncated)');
      break;
    }
  }
  return chunks;
}

/** Forward text cap — splitTelegramText bounds delivery to ~10 chunks regardless. */
export const FORWARD_MAX_TEXT_LENGTH = 40_000;

// ─── Streaming (VES-TG-STREAM) ───────────────────────────────────

/** Minimum time between live `editMessageText` calls (Bot API flood guard). */
export const STREAM_EDIT_THROTTLE_MS = 1200;

/** `typing` expires after ~5s — refresh faster than that while thinking. */
export const STREAM_TYPING_REFRESH_MS = 4000;

/** Placeholder shown between `typing` and the first text delta. */
export const STREAM_PLACEHOLDER = '…';

/** Live cursor appended while text is still arriving. */
export const STREAM_CURSOR = ' ▍';

/**
 * Truncate accumulated text for a live edit ( Telegram 4096 cap ).
 * Pure — safe to unit test.
 */
export function truncateLiveText(text: string): string {
  return text.length <= TELEGRAM_CHUNK_TARGET ? text : text.slice(0, TELEGRAM_CHUNK_TARGET);
}

/**
 * Decide whether a live edit should fire now. Skips empty and identical
 * text (the Bot API rejects no-op edits) and throttles the rest.
 * Pure — safe to unit test.
 */
export function shouldSendStreamEdit(
  now: number,
  lastEditAt: number,
  lastSent: string,
  next: string,
  throttleMs: number = STREAM_EDIT_THROTTLE_MS,
): boolean {
  if (!next || next === lastSent) return false;
  return now - lastEditAt >= throttleMs;
}

export interface ForwardChat {
  readonly chatId: string;
  readonly type: 'direct' | 'group';
  readonly title?: string;
  readonly lastActivityAt: string;
}

export type ForwardTargetErrorCode = 'NO_LINKED_CHATS' | 'UNKNOWN_CHAT' | 'AMBIGUOUS_CHAT';

/**
 * Resolve the forward destination from workspace-scoped active bindings.
 * Pure — safe to unit test.
 *
 * Fail-closed: an explicit chatId must match an active binding in this
 * workspace (the bot is never an open relay); without one, a single linked
 * chat wins, several require an explicit choice, none is an error.
 */
export function resolveForwardTarget(
  bindings: readonly ConversationBinding[],
  chatId?: string,
):
  | { readonly ok: true; readonly binding: ConversationBinding }
  | { readonly ok: false; readonly code: ForwardTargetErrorCode; readonly message: string } {
  const trimmed = chatId?.trim();
  if (trimmed) {
    const match = bindings.find((b) => b.telegramChatId === trimmed);
    if (!match) {
      return {
        ok: false,
        code: 'UNKNOWN_CHAT',
        message: 'That Telegram chat is not linked to this workspace.',
      };
    }
    return { ok: true, binding: match };
  }
  if (bindings.length === 0) {
    return {
      ok: false,
      code: 'NO_LINKED_CHATS',
      message: 'No linked Telegram chats. Send a message to your bot first, then forward.',
    };
  }
  if (bindings.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_CHAT',
      message: 'Several Telegram chats are linked — pick one.',
    };
  }
  return { ok: true, binding: bindings[0] as ConversationBinding };
}

/**
 * Deliver the assistant reply to the Telegram chat via the Bot API.
 * Best-effort: returns 'sent', 'skipped' (no bot token / nothing to send),
 * or 'failed'. Never throws — delivery problems must not fail the pipeline.
 */
async function deliverTelegramReply(
  conversation: ConversationBinding,
  text: string | undefined,
): Promise<'sent' | 'skipped' | 'failed'> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !text) return 'skipped';
  try {
    const adapter = new TelegramAdapter({ botToken });
    for (const chunk of splitTelegramText(text)) {
      const result = await adapter.sendDelivery({
        id: `tg-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channel: 'telegram',
        conversation: {
          channel: 'telegram',
          externalId: conversation.telegramChatId,
          type: conversation.telegramChatType === 'group' ? 'group' : 'direct',
          title: conversation.telegramChatTitle,
        },
        content: { text: chunk },
        priority: 'normal',
      });
      if (!result.success) return 'failed';
    }
    return 'sent';
  } catch (error) {
    console.warn('[telegram] reply delivery failed', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

// ─── VES-TG-030: Question Bridge ───────────────────────────────
// Forwards pending assistant questions to the bound Telegram chat and
// routes answers back into the AssistantInteractionBroker. Telegram holds
// only transport correlation (chat/message → conversation/request); the
// broker stays the answer authority.

export interface AssistantQuestionForward {
  readonly conversationId: string;
  readonly requestId: string;
  readonly questions: readonly ProjectedQuestion[];
}

/**
 * Forward a pending assistant question to the Telegram chat bound to the
 * Vestara conversation. Best-effort fire-and-forget: never throws, so a
 * missing token or chat can never break the agent turn (the browser path
 * still awaits the broker).
 */
export async function forwardAssistantQuestionToTelegram(input: AssistantQuestionForward): Promise<void> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;
    const service = getConversationBindingService();
    const workspaceId = (workspaceContext && path.basename(workspaceContext.repoPath)) || 'workspace';
    const adapter = new TelegramAdapter({ botToken });
    const result = await forwardAssistantQuestion(
      {
        botToken,
        findBinding: (conversationId) => {
          const binding = service.getBindingByConversationId(conversationId);
          if (binding?.status !== 'active' || binding.workspaceId !== workspaceId) return undefined;
          return {
            telegramChatId: binding.telegramChatId,
            telegramChatType: binding.telegramChatType,
            telegramChatTitle: binding.telegramChatTitle,
            principalId: binding.principalId,
          };
        },
        sendQuestion: async (chatId, text, keyboard) => {
          const delivery = await adapter.sendDelivery({
            id: `tg-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channel: 'telegram',
            conversation: { channel: 'telegram', externalId: chatId, type: 'direct' },
            content: { text, inlineKeyboard: keyboard },
            priority: 'high',
          });
          return delivery.success && delivery.externalMessageId
            ? { ok: true as const, messageId: delivery.externalMessageId }
            : { ok: false as const };
        },
      },
      input,
    );
    if (!result.forwarded) {
      console.warn(`[telegram] question forward skipped (${result.reason}) for conversation ${input.conversationId}`);
    }
  } catch (error) {
    console.warn('[telegram] question forward failed', error instanceof Error ? error.message : error);
  }
}

/**
 * The answering sender must own the question through the canonical
 * principal. The ledger records the canonical principal (conversation
 * bindings are created with it), while the pairing record carries the raw
 * approval-time principal — resolve before comparing, never raw-to-canonical.
 * Without a principal store the check falls back to the raw pairing
 * principal (previous behavior).
 */
async function isQuestionSenderAuthorized(
  entry: TrackedQuestion,
  senderTelegramUserId: string,
  principals: WorkspaceContext['humanPrincipals'] | undefined,
): Promise<boolean> {
  const pairing = getPairingService().getBindingByTelegramId(senderTelegramUserId);
  if (!pairing?.active) return false;
  if (principals) {
    const resolved = await resolveTelegramIdentity(pairing, principals).catch(() => undefined);
    if (resolved) return resolved.principal.id === entry.principalId;
  }
  return pairing.principalId === entry.principalId;
}

/**
 * Route a raw webhook body carrying a callback_query to the question
 * bridge. Returns true when the tap belonged to a forwarded question;
 * false leaves every existing button behavior untouched.
 */
export async function dispatchTelegramQuestionTap(ctx: WorkspaceContext, rawBody: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  let data = '';
  let callbackQueryId = '';
  let chatId = '';
  let messageId = '';
  let senderId = '';
  try {
    const body = JSON.parse(rawBody) as {
      readonly callback_query?: {
        readonly id?: unknown;
        readonly data?: unknown;
        readonly from?: { readonly id?: unknown };
        readonly message?: { readonly message_id?: unknown; readonly chat?: { readonly id?: unknown } };
      };
    };
    const query = body?.callback_query;
    if (typeof query?.data !== 'string' || !query.data.startsWith('tq:')) return false;
    data = query.data;
    callbackQueryId = typeof query.id === 'string' ? query.id : String(query.id ?? '');
    chatId = String(query.message?.chat?.id ?? '');
    messageId = String(query.message?.message_id ?? '');
    senderId = String(query.from?.id ?? '');
  } catch {
    return false;
  }
  if (!callbackQueryId || !chatId || !messageId || !senderId) return false;
  const adapter = new TelegramAdapter({ botToken });
  const outcome = await dispatchQuestionTap(
    {
      isAuthorized: (entry, sender) => isQuestionSenderAuthorized(entry, sender, ctx.humanPrincipals),
      decide: (conversationId, requestId, answers) =>
        ctx.assistantInteractionBroker.decideQuestion(conversationId, requestId, { answers }),
      cancel: (conversationId, requestId) => ctx.assistantInteractionBroker.cancelQuestion(conversationId, requestId),
      // Question-answer mirror: tap resolutions left no Room trace (the
      // typed path reports through confirmMessage below). Best-effort.
      onResolved: (resolution: QuestionResolution) => {
        void mirrorTelegramReplyToActivityRoom(
          buildQuestionAnswerMirrorMessage({
            question: resolution.entry.questions[0]?.question ?? 'Question',
            picked: resolution.answers.map((row) => [...row].join(', ')).join(' · '),
            senderLabel: resolution.senderTelegramUserId,
            accepted: resolution.accepted,
            outcome: resolution.outcome,
          }),
        );
      },
      answerTap: async (id, text) => {
        await adapter.answerCallbackQuery(id, text);
      },
      updateMessage: async (targetChatId, targetMessageId, text, keyboard) => {
        await adapter.sendDelivery({
          id: `tg-question-update-${Date.now()}`,
          channel: 'telegram',
          conversation: { channel: 'telegram', externalId: targetChatId, type: 'direct' },
          content: { text, ...(keyboard ? { inlineKeyboard: keyboard } : {}) },
          editMessageId: targetMessageId,
          priority: 'normal',
        });
      },
    },
    { chatId, messageId, callbackQueryId, callbackData: data, senderTelegramUserId: senderId },
  );
  return outcome.handled;
}

/**
 * Answer a forwarded question from a typed chat reply. Returns
 * `passthrough` for everything that is not a live question answer, so
 * normal chat routing continues untouched.
 *
 * Exported for unit tests (answer-mirror coverage) — the HTTP surface is
 * unchanged.
 */
export async function tryAnswerForwardedQuestionByText(
  message: ChannelMessage,
): Promise<{ readonly status: 'answered' | 'unauthorized' | 'passthrough' }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { status: 'passthrough' };
  const adapter = new TelegramAdapter({ botToken });
  const outcome = await answerQuestionByText(
    {
      isAuthorized: (entry, sender) => isQuestionSenderAuthorized(entry, sender, workspaceContext?.humanPrincipals),
      decide: (conversationId, requestId, answers) =>
        workspaceContext?.assistantInteractionBroker.decideQuestion(conversationId, requestId, { answers }) ?? false,
      confirmMessage: async (entry, answers, accepted) => {
        const picked = answers.map((row) => [...row].join(', ')).join(' · ');
        const summary = accepted ? `Answered: ${picked}` : 'Already resolved in the app.';
        const text = `✅ ${entry.questions[0]?.question ?? 'Question'}\n${summary}`;
        const edited = await adapter.sendDelivery({
          id: `tg-question-resolve-${Date.now()}`,
          channel: 'telegram',
          conversation: { channel: 'telegram', externalId: entry.chatId, type: 'direct' },
          content: { text },
          editMessageId: entry.messageId,
          priority: 'normal',
        });
        if (!edited.success) await adapter.sendTextMessage(entry.chatId, text);
        // Question-answer mirror: the raw typed answer was already
        // projected as inbound; project the resolution so the Room shows
        // what it meant and whether the broker accepted it.
        void mirrorTelegramReplyToActivityRoom(
          buildQuestionAnswerMirrorMessage({
            question: entry.questions[0]?.question ?? 'Question',
            picked,
            senderLabel: message.sender.displayName ?? message.sender.externalId,
            accepted,
            outcome: 'answered',
          }),
        );
      },
    },
    {
      chatId: message.conversation.externalId,
      senderTelegramUserId: message.sender.externalId,
      text: message.text ?? '',
    },
  );
  if (!outcome.handled) return { status: 'passthrough' };
  return outcome.outcome === 'answered' ? { status: 'answered' } : { status: 'unauthorized' };
}

/**
 * Parse a Telegram bot command from message text. Returns the command
 * name for known commands, null otherwise. Handles `@BotName` suffixes
 * (group chats) and trailing args; case-insensitive.
 * `/pair` + `/start` are API-owned (pairing-code flow); `/help`,
 * `/status`, `/workspace`, `/conversations` are read-only projections
 * over the TG-012 registry. Anything else falls through to normal chat
 * routing. Pure — safe to unit test.
 */
export type TelegramBotCommand = 'pair' | 'start' | 'help' | 'status' | 'workspace' | 'conversations';

export function parseTelegramCommandText(text: string | undefined): TelegramBotCommand | null {
  if (!text) return null;
  const first = text.trim().split(/\s+/)[0] ?? '';
  const cmd = first.split('@')[0]?.toLowerCase();
  switch (cmd) {
    case '/pair':
      return 'pair';
    case '/start':
      return 'start';
    case '/help':
      return 'help';
    case '/status':
      return 'status';
    case '/workspace':
      return 'workspace';
    case '/conversations':
      return 'conversations';
    default:
      return null;
  }
}

/** Args after the `/command[@Bot]` head. Pure — safe to unit test. */
export function parseTelegramCommandArgs(text: string | undefined): string[] {
  if (!text) return [];
  return text.trim().split(/\s+/).slice(1);
}

let commandRegistry: TelegramCommandRegistry | null = null;

/**
 * TG-012 registry wired to the live binding authorities. Read-only
 * projections only — `/pair` and `/start` stay API-owned (pairing-code
 * issuance + Room mirror of the code).
 */
function getCommandRegistry(): TelegramCommandRegistry {
  if (!commandRegistry) {
    commandRegistry = new TelegramCommandRegistry({
      providers: {
        workspaceBindings: getWorkspaceBindingService(),
        conversationBindings: getConversationBindingService(),
      },
    });
  }
  return commandRegistry;
}

/**
 * Resolve the caller's principal for info commands: canonical identity
 * when the store is available, raw pairing principal otherwise (same
 * fallback as the question-bridge authorization). Unpaired callers get
 * undefined and the registry answers with its "need to pair" copy.
 */
async function resolveCommandPrincipalId(
  telegramUserId: string,
  principals: WorkspaceContext['humanPrincipals'] | undefined,
): Promise<string | undefined> {
  const pairing = getPairingService().getBindingByTelegramId(telegramUserId);
  if (!pairing?.active) return undefined;
  if (principals) {
    const resolved = await resolveTelegramIdentity(pairing, principals).catch(() => undefined);
    if (resolved) return resolved.principal.id;
  }
  return pairing.principalId;
}

/**
 * The Bot API relay sends plain text — drop the registry's `**`
 * emphasis markers so users never see literal asterisks. Pure.
 */
export function stripTelegramMarkdown(text: string): string {
  return text.replace(/\*\*/g, '');
}

/**
 * Deliver an info-command reply over the Bot API and project it into
 * the Activity Room (same TG-031 bridge as /pair + /start).
 * Best-effort: never throws, never fails the command path.
 */
async function deliverCommandReply(chatId: string, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      await new TelegramAdapter({ botToken }).sendTextMessage(chatId, text);
    } catch (error) {
      console.warn('[telegram] command reply delivery failed', error instanceof Error ? error.message : error);
    }
  }
  void mirrorTelegramReplyToActivityRoom(text);
}

/**
 * Execute a read-only info command through the TG-012 registry and relay
 * the reply (Bot API send + Room mirror). The registry enforces pairing
 * itself, so unpaired callers get its "need to pair" copy.
 */
async function runInfoCommand(
  message: ChannelMessage,
  command: 'help' | 'status' | 'workspace' | 'conversations',
  ctx: WorkspaceContext | undefined,
): Promise<{
  status: 'command-answered';
  command: 'help' | 'status' | 'workspace' | 'conversations';
  success: boolean;
}> {
  const chatId = message.conversation.externalId;
  const principalId = await resolveCommandPrincipalId(message.sender.externalId, ctx?.humanPrincipals);
  const chatType = message.conversation.type;
  const context: CommandContext = {
    telegramUserId: message.sender.externalId,
    telegramChatId: chatId,
    telegramChatType: chatType === 'channel' ? 'group' : chatType,
    ...(principalId ? { principalId } : {}),
    args: parseTelegramCommandArgs(message.text),
  };
  const result = await getCommandRegistry().executeCommand(command, context);
  await deliverCommandReply(chatId, stripTelegramMarkdown(result.response));
  return { status: 'command-answered', command, success: result.success };
}

/**
 * Answer `/start` and `/pair` directly over the Bot API.
 *
 * Previously these fell into the pairing guard, whose `unpaired` error
 * only reached the webhook HTTP response — the user saw silence and
 * retried forever. Commands are handled before identity resolution so
 * unpaired users always get a visible answer.
 *
 * TG-031: every reply built here is also projected into the Activity Room
 * via `mirrorTelegramReplyToActivityRoom` so the operator surface shows
 * the pairing code. Projection-only — the Bot API send stays the delivery
 * authority and mirroring never fails the command path.
 *
 * Read-only info commands (`help`/`status`/`workspace`/`conversations`)
 * execute through the TG-012 registry with the live binding authorities;
 * the registry enforces pairing itself, so unpaired callers get its
 * "need to pair" copy — never silence.
 */
export async function handleTelegramCommand(
  message: ChannelMessage,
  command: TelegramBotCommand,
  ctx?: WorkspaceContext,
): Promise<
  | { status: 'started'; paired: boolean }
  | { status: 'already-paired'; principalId: string }
  | { status: 'pairing-requested'; pairingId: string; expiresAt: string }
  | { status: 'pairing-failed'; error: string }
  | { status: 'command-answered'; command: 'help' | 'status' | 'workspace' | 'conversations'; success: boolean }
> {
  const pairing = getPairingService();
  const telegramUserId = message.sender.externalId;
  const displayName = message.sender.displayName ?? telegramUserId;
  const chatId = message.conversation.externalId;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adapter = botToken ? new TelegramAdapter({ botToken }) : null;

  const existing = pairing.getBindingByTelegramId(telegramUserId);

  if (command === 'start') {
    const paired = !!existing?.active;
    const text = paired
      ? `Hello ${displayName}! Your Telegram is paired with Vestara — just send a message.`
      : "Hello! I'm the Vestara assistant bot.\n\nSend /pair to link your Telegram account. You'll get a code to share with your Vestara operator for approval.";
    if (adapter) {
      await adapter.sendTextMessage(chatId, text);
    }
    // TG-031: project the reply into the Activity Room so the operator
    // surface shows what the user was told. Best-effort, never fails.
    void mirrorTelegramReplyToActivityRoom(text);
    return { status: 'started', paired };
  }

  // Read-only info commands run before the pairing flow: the registry
  // enforces pairing itself, and a paired /status must report status —
  // not fall into the already-paired /pair notice below.
  if (command === 'help') return runInfoCommand(message, 'help', ctx);
  if (command === 'status') return runInfoCommand(message, 'status', ctx);
  if (command === 'workspace') return runInfoCommand(message, 'workspace', ctx);
  if (command === 'conversations') return runInfoCommand(message, 'conversations', ctx);

  if (existing?.active) {
    const text = `You're already paired as ${existing.principalName} — just send a message.`;
    if (adapter) {
      await adapter.sendTextMessage(chatId, text);
    }
    // TG-031: same Room projection as above.
    void mirrorTelegramReplyToActivityRoom(text);
    return { status: 'already-paired', principalId: existing.principalId };
  }

  try {
    const request = pairing.createPairingRequest(telegramUserId, displayName);
    const mins = Math.max(1, Math.round((Date.parse(request.expiresAt) - Date.now()) / 60000));
    const text = `Your Vestara pairing code:\n\n${request.token}\n\nShare it with your Vestara operator to approve (expires in ~${mins} min). Then just send me a message.`;
    if (adapter) {
      await adapter.sendTextMessage(chatId, text);
    }
    // TG-031: the pairing code must be visible on the operator surface —
    // Details on the mirrored /pair row now shows this agent reply.
    void mirrorTelegramReplyToActivityRoom(text);
    // One-click Room approval: present an Approve/Reject interaction.
    // Best-effort and skippable (tests call without ctx) — never fails /pair.
    if (ctx?.interactionService) {
      void presentTelegramPairingApproval(ctx.interactionService, {
        pairingId: request.id,
        telegramUserId,
        telegramDisplayName: displayName,
        token: request.token,
        expiresAt: request.expiresAt,
      });
    }
    return { status: 'pairing-requested', pairingId: request.id, expiresAt: request.expiresAt };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Pairing failed';
    const text =
      reason === 'Maximum pending pairing requests reached'
        ? 'You already have a pending pairing request — ask your Vestara operator to approve it.'
        : `Pairing failed: ${reason}`;
    if (adapter) {
      await adapter.sendTextMessage(chatId, text);
    }
    // TG-031: project the failure reply too, so the Room never implies silence.
    void mirrorTelegramReplyToActivityRoom(text);
    return { status: 'pairing-failed', error: reason };
  }
}

/**
 * Single-flight the Activity Room bridge imports (TG-032). The Telegram
 * pipeline fires mirrors fire-and-forget, so the incoming and reply
 * mirrors overlap in flight — sharing one module namespace avoids
 * duplicate loads and keeps every mirror on the same bridge.
 */
let mirrorBridgePromise: Promise<
  readonly [typeof import('./activity-room-m11a.js'), typeof import('@vestara/activity-room')]
> | null = null;

function loadMirrorBridge(): Promise<
  readonly [typeof import('./activity-room-m11a.js'), typeof import('@vestara/activity-room')]
> {
  if (!mirrorBridgePromise) {
    mirrorBridgePromise = Promise.all([import('./activity-room-m11a.js'), import('@vestara/activity-room')]);
  }
  return mirrorBridgePromise;
}

/**
 * Mirror a Telegram message into the Activity Room (M9 durable store) so it
 * appears on the M11C surface — the same bridge the composer uses
 * (`mirrorHumanMessageToM9` in activity-room.ts). Best-effort and
 * fire-and-forget: throws nothing (M11A is uninitialized in unit tests),
 * and a mirror failure must never fail the Telegram pipeline.
 */
async function mirrorTelegramIncomingToActivityRoom(message: ChannelMessage): Promise<void> {
  try {
    const text = message.text?.trim();
    if (!text) return;
    const [{ getM11ARoom }, { fromHumanMessage }] = await loadMirrorBridge();
    const displayName = message.sender.displayName ?? message.sender.externalId;
    await getM11ARoom().store.append(
      fromHumanMessage({
        message: `[Telegram] ${displayName}: ${text}`,
        userId: message.sender.externalId,
        displayName: `${displayName} (Telegram)`,
        messageId: `tg-in-${message.id}`,
      }),
    );
  } catch (error) {
    console.warn('[telegram] activity mirror (incoming) failed', error instanceof Error ? error.message : error);
  }
}

/**
 * Mirror the assistant reply to a Telegram message into the Activity Room
 * (M9 durable store) via the canonical `fromAgentLifecycle` adapter — the
 * same bridge as `mirrorAgentReplyToM9` in activity-room.ts. Best-effort:
 * throws nothing; failures are counted in logs only.
 */
async function mirrorTelegramReplyToActivityRoom(response: string): Promise<void> {
  try {
    const [{ getM11ARoom }, { fromAgentLifecycle }] = await loadMirrorBridge();
    await getM11ARoom().store.append(
      fromAgentLifecycle({
        agentId: 'agent-assistant',
        displayName: 'Assistant',
        lifecycleType: 'completed',
        message: response,
        role: 'assistant',
      }),
    );
  } catch (error) {
    console.warn('[telegram] activity mirror (reply) failed', error instanceof Error ? error.message : error);
  }
}

/**
 * TG-032: user-visible copy for every guard rejection in
 * `processTelegramMessage`. Previously guard failures only reached the
 * webhook HTTP response — the Telegram user saw silence and the operator
 * saw nothing. Every guard below now delivers a visible reply over the
 * Bot API and projects it into the Activity Room (same TG-031 bridge).
 * Internal identifiers (telegram user IDs, principal IDs) stay in the
 * HTTP response + logs; chat copy is generic by design.
 */
export type TelegramGuardFailureStatus =
  | 'unpaired'
  | 'unresolved-identity'
  | 'question-unauthorized'
  | 'no-workspace'
  | 'conversation-limit'
  | 'not-configured'
  | 'queued'
  | 'rejected'
  | 'failed';

/** Max user-facing error detail characters (TG-032) — bounds Bot API + Room copy. */
const GUARD_DETAIL_MAX_LENGTH = 300;

/**
 * Build the user-visible copy for a guard rejection.
 * Pure — safe to unit test.
 */
export function buildGuardFailureReply(status: TelegramGuardFailureStatus, detail?: string): string {
  const clean = (detail ?? '').trim().replace(/\s+/g, ' ');
  const short = clean.length > GUARD_DETAIL_MAX_LENGTH ? `${clean.slice(0, GUARD_DETAIL_MAX_LENGTH)}…` : clean;
  switch (status) {
    case 'unpaired':
      return "You're not paired with Vestara yet.\n\nSend /pair to link your Telegram account — you'll get a code to share with your Vestara operator for approval.";
    case 'unresolved-identity':
      return 'Your Telegram is paired but not linked to a Vestara operator identity yet — ask your operator to finish enrollment, then try again.';
    case 'question-unauthorized':
      return 'Only the paired operator can answer that question.';
    case 'no-workspace':
      return 'No workspace is linked to your account yet — ask your Vestara operator to link one, then try again.';
    case 'conversation-limit':
      return 'This chat reached the maximum linked conversations — ask your operator to reset the binding, then try again.';
    case 'not-configured':
      return "The Telegram assistant isn't ready right now — try again in a bit.";
    case 'queued':
      return 'Working on it — your request is queued and the reply will land here.';
    case 'rejected':
      return short ? `That was rejected: ${short}` : 'That was rejected by policy.';
    case 'failed':
      return short ? `That run failed: ${short}` : 'That run failed — try again.';
  }
}

/**
 * Deliver a guard rejection to the user over the Bot API and project it
 * into the Activity Room. Best-effort: never throws, never fails the
 * pipeline. Exported for unit tests (TG-032 coverage) — the HTTP surface
 * is unchanged.
 */
export async function notifyGuardFailure(chatId: string, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      await new TelegramAdapter({ botToken }).sendTextMessage(chatId, text);
    } catch (error) {
      console.warn('[telegram] guard reply delivery failed', error instanceof Error ? error.message : error);
    }
  }
  // Project the reply into the Activity Room so the operator surface
  // shows what the user was told. Fire-and-forget: never fails.
  void mirrorTelegramReplyToActivityRoom(text);
}

/**
 * Build the Activity Room copy for a Telegram-resolved assistant
 * question (tap or typed answer). Pure — safe to unit test. The user's
 * raw answer text was already projected as inbound; this projects the
 * resolution (what it meant, who sent it, whether the broker accepted
 * it) so the operator surface shows the outcome.
 */
export interface TelegramQuestionAnswerMirror {
  readonly question: string;
  readonly picked: string;
  readonly senderLabel: string;
  readonly accepted: boolean;
  readonly outcome: 'answered' | 'rejected';
}

export function buildQuestionAnswerMirrorMessage(mirror: TelegramQuestionAnswerMirror): string {
  const who = mirror.senderLabel.trim() || 'unknown sender';
  const what = mirror.question.trim() || 'Question';
  if (mirror.outcome === 'rejected') return `[Telegram] ${who} rejected "${what}"`;
  const verdict = mirror.accepted ? '' : ' (already resolved in the app)';
  return `[Telegram] ${who} answered "${what}": ${mirror.picked}${verdict}`;
}

/**
 * Build the Activity Room copy for an outbound Telegram forward.
 * Pure — safe to unit test. Mirrors the inbound `[Telegram] Name: text`
 * convention so the stream reads symmetrically in both directions.
 */
export function buildForwardMirrorMessage(chatId: string, text: string): string {
  return `[To Telegram ${chatId}] ${text}`;
}

/**
 * Mirror an explicit operator forward (Activity Room → Telegram) into the
 * Activity Room (M9 durable store) via the canonical `fromHumanMessage`
 * adapter — the same bridge the composer uses (`mirrorHumanMessageToM9`
 * in activity-room.ts). Without this, free-text forwards leave no Room
 * record at all (the Bot API delivery is the only trace). Best-effort and
 * fire-and-forget: throws nothing (M11A is uninitialized in unit tests),
 * and a mirror failure must never fail the forward response.
 */
export async function mirrorTelegramForwardToActivityRoom(
  chatId: string,
  text: string,
  operator: { readonly id: string; readonly name: string },
): Promise<void> {
  try {
    const [{ getM11ARoom }, { fromHumanMessage }] = await loadMirrorBridge();
    await getM11ARoom().store.append(
      fromHumanMessage({
        message: buildForwardMirrorMessage(chatId, text),
        userId: operator.id,
        displayName: `${operator.name} (→ Telegram)`,
        messageId: `tg-forward-${Date.now()}`,
      }),
    );
  } catch (error) {
    console.warn('[telegram] activity mirror (forward) failed', error instanceof Error ? error.message : error);
  }
}

/**
 * Process a normalized Telegram message through the full pipeline:
 * 1. Resolve identity binding (Telegram user -> Vestara principal)
 * 2. Resolve workspace binding (principal -> workspace)
 * 3. Resolve or create conversation binding (chat -> Vestara conversation)
 * 4. Route through GlobalAssistantTextRouter
 * 5. Return the execution result
 *
 * TG-032: every guard rejection below delivers a user-visible reply over
 * the Bot API and mirrors it into the Activity Room via
 * `notifyGuardFailure` — the HTTP error alone is silence to the user.
 * Exported for unit tests (TG-032 guard coverage) — the HTTP surface is
 * unchanged.
 */
export async function processTelegramMessage(
  message: ChannelMessage,
  ctx: WorkspaceContext,
): Promise<{
  status: string;
  response?: string;
  executionId?: string;
  conversationId?: string;
  reply?: 'sent' | 'skipped' | 'failed';
  error?: string;
}> {
  const pairing = getPairingService();
  const wsBindings = getWorkspaceBindingService();
  const convBindings = getConversationBindingService();
  const router = getTextRouter(ctx);

  // Project the incoming message into the Activity Room (M9) so it is
  // visible on the /activity surface. Fire-and-forget: mirroring must
  // never slow the webhook response or fail the pipeline.
  void mirrorTelegramIncomingToActivityRoom(message);

  // 0. Bot commands are answered directly — before the identity guard,
  // which would otherwise swallow them into silence (its error only
  // reaches the webhook HTTP response, never the user's chat).
  // `/pair` + `/start` are API-owned; `/help`, `/status`, `/workspace`,
  // `/conversations` execute through the TG-012 registry. Everything
  // else falls through to the identity guard and normal routing.
  const command = parseTelegramCommandText(message.text);
  if (command) {
    return handleTelegramCommand(message, command, ctx);
  }

  // 1. Resolve identity
  const telegramUserId = message.sender.externalId;
  const identity = pairing.getBindingByTelegramId(telegramUserId);
  if (!identity) {
    // TG-032: unpaired users must see this — the HTTP error alone is silence.
    void notifyGuardFailure(message.conversation.externalId, buildGuardFailureReply('unpaired'));
    return {
      status: 'unpaired',
      error: `Telegram user ${telegramUserId} is not paired. Use /pair to link your account.`,
    };
  }

  // A Telegram-local pairing is not itself a canonical human identity. The
  // explicit pairing principal must resolve through HumanPrincipalStorage;
  // otherwise this request remains unresolved and cannot enter routing.
  const resolvedIdentity = await resolveTelegramIdentity(identity, ctx.humanPrincipals);
  if (!resolvedIdentity) {
    // TG-032: same silence problem as unpaired — tell the user.
    void notifyGuardFailure(message.conversation.externalId, buildGuardFailureReply('unresolved-identity'));
    return {
      status: 'unresolved-identity',
      error: `Telegram user ${telegramUserId} has no canonical Vestara principal binding.`,
    };
  }
  const canonicalPrincipalId = resolvedIdentity.principal.id;
  const canonicalBinding = { ...identity, principalId: canonicalPrincipalId };

  // VES-TG-030: a typed answer to a forwarded assistant question wins over
  // normal routing — but only when the text actually answers a live
  // question in this chat. Anything else falls through untouched.
  const textAnswer = await tryAnswerForwardedQuestionByText(message);
  if (textAnswer.status === 'answered') {
    return { status: 'question-answered' };
  }
  if (textAnswer.status === 'unauthorized') {
    // TG-032: unauthorized answers were silent to the user.
    void notifyGuardFailure(message.conversation.externalId, buildGuardFailureReply('question-unauthorized'));
    return { status: 'question-unauthorized', error: 'Only the paired operator can answer this question.' };
  }

  // 2. Resolve workspace — auto-bind on first message. Pairing already
  // required operator approval, so an approved principal messaging the
  // bot is bound to the current workspace (first binding is preferred,
  // mirroring the simulate path). Without this, paired users hit a
  // dead-end `no-workspace` silence.
  let workspace = wsBindings.getPreferredWorkspace(canonicalPrincipalId);
  if (!workspace) {
    const currentWorkspaceId = path.basename(ctx.repoPath) || 'workspace';
    try {
      wsBindings.bindWorkspace(canonicalPrincipalId, currentWorkspaceId, currentWorkspaceId);
    } catch {
      // Already bound (race) — fall through to re-read.
    }
    workspace = rereadCanonicalWorkspace(wsBindings, canonicalPrincipalId);
  }
  if (!workspace) {
    // TG-032: paired but workspace-less users must see this.
    void notifyGuardFailure(message.conversation.externalId, buildGuardFailureReply('no-workspace'));
    return {
      status: 'no-workspace',
      error: `No workspace bound for principal ${canonicalPrincipalId}.`,
    };
  }

  // 3. Resolve or create conversation binding, scoped to the resolved
  // workspace so a chat bound elsewhere can never leak across workspaces.
  const chatId = message.conversation.externalId;
  let conversation = convBindings.getActiveBinding(chatId, canonicalPrincipalId, workspace.workspaceId);

  if (!conversation) {
    // Auto-create a new Vestara conversation
    if (!convBindings.canCreateConversation(chatId)) {
      // TG-032: the limit error must reach the chat, not just the webhook log.
      void notifyGuardFailure(chatId, buildGuardFailureReply('conversation-limit'));
      return {
        status: 'conversation-limit',
        error: 'Maximum conversations per chat reached.',
      };
    }

    // Create a new Vestara conversation
    const vestaraConv = await ctx.conversationService.createConversation(canonicalPrincipalId);
    conversation = convBindings.createBinding({
      principalId: canonicalPrincipalId,
      workspaceId: workspace.workspaceId,
      telegramChatId: chatId,
      telegramChatType: message.conversation.type === 'channel' ? 'group' : message.conversation.type,
      telegramChatTitle: message.conversation.title,
      vestaraConversationId: vestaraConv.id,
      vestaraConversationTitle: vestaraConv.title,
    });
  }

  // 4. Stream through the text router with live Telegram edits
  // (VES-TG-STREAM): typing indicator at once, placeholder message while
  // thinking, throttled editMessageText as tokens arrive, cursor dropped
  // on the final text. Gating (rate limit, concurrency, closed) is
  // enforced inside routeStream — identical to the single-shot path.
  if (!router) {
    // TG-032: misconfiguration must be visible in the chat + Room.
    void notifyGuardFailure(message.conversation.externalId, buildGuardFailureReply('not-configured'));
    return {
      status: 'not-configured',
      error: 'Telegram text router not initialized.',
    };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adapter = botToken ? new TelegramAdapter({ botToken }) : null;
  const streamChatId = conversation.telegramChatId;

  // Immediate typing indicator — the user sees activity at once, long
  // before the first token. Best-effort: never fails the pipeline.
  if (adapter) void adapter.sendChatAction(streamChatId, 'typing');
  const typingTimer = adapter
    ? setInterval(() => {
        void adapter.sendChatAction(streamChatId, 'typing');
      }, STREAM_TYPING_REFRESH_MS)
    : null;

  let placeholderId: string | undefined;
  let lastSent = '';
  let lastEditAt = 0;
  let telegramOk = true;

  const sink: StreamSink = {
    onStart: async () => {
      if (adapter) placeholderId = await adapter.sendTextMessage(streamChatId, STREAM_PLACEHOLDER);
    },
    onText: async (fullText) => {
      if (!adapter || !placeholderId) return;
      const now = Date.now();
      if (!shouldSendStreamEdit(now, lastEditAt, lastSent, fullText)) return;
      const live = truncateLiveText(fullText) + STREAM_CURSOR;
      if (await adapter.editTextMessage(streamChatId, placeholderId, live)) {
        lastSent = live;
        lastEditAt = now;
      } else {
        telegramOk = false;
      }
    },
    onComplete: async (fullText) => {
      if (typingTimer) clearInterval(typingTimer);
      if (!adapter) return;
      if (!placeholderId) {
        // Placeholder send failed — fall back to chunked single-shot.
        if (fullText) {
          const reply = await deliverTelegramReply(conversation, fullText);
          if (reply === 'failed') telegramOk = false;
        }
        return;
      }
      if (!fullText) {
        await adapter.editTextMessage(streamChatId, placeholderId, '(no response)');
        return;
      }
      if (fullText.length <= TELEGRAM_MAX_TEXT_LENGTH) {
        if (fullText !== lastSent) {
          if (!(await adapter.editTextMessage(streamChatId, placeholderId, fullText))) telegramOk = false;
        }
        return;
      }
      // Over the limit: first chunk edits the placeholder, the rest
      // follow as new messages (same chunking as single-shot).
      const chunks = splitTelegramText(fullText);
      if (!(await adapter.editTextMessage(streamChatId, placeholderId, chunks[0]))) telegramOk = false;
      for (const chunk of chunks.slice(1)) {
        const id = await adapter.sendTextMessage(streamChatId, chunk);
        if (!id) {
          telegramOk = false;
          break;
        }
      }
    },
  };

  const routeResult = await router.routeStream(message, canonicalBinding, workspace, conversation, sink);
  if (typingTimer) clearInterval(typingTimer);

  if (routeResult.status === 'queued') {
    // TG-032: without this the user stares at the "thinking" placeholder
    // with no Room record of the outcome.
    void notifyGuardFailure(streamChatId, buildGuardFailureReply('queued'));
    return { status: 'queued', conversationId: routeResult.conversationId };
  }
  if (routeResult.status === 'rejected') {
    // TG-032: clear the stale "thinking" placeholder with the refusal and
    // mirror it — exactly one Room record either way.
    const text = buildGuardFailureReply('rejected', routeResult.error);
    if (adapter && placeholderId) {
      const edited = await adapter.editTextMessage(streamChatId, placeholderId, text);
      if (!edited) void notifyGuardFailure(streamChatId, text);
      else void mirrorTelegramReplyToActivityRoom(text);
    } else {
      void notifyGuardFailure(streamChatId, text);
    }
    return { status: 'rejected', error: routeResult.error, conversationId: routeResult.conversationId };
  }
  if (routeResult.status === 'failed') {
    // TG-032: the placeholder edit is the user-visible signal; mirror it
    // so the Room shows the failure instead of implying silence.
    const text = buildGuardFailureReply('failed', routeResult.error);
    // Don't leave a stale placeholder behind on execution failure.
    if (adapter && placeholderId) {
      const edited = await adapter.editTextMessage(streamChatId, placeholderId, text);
      if (!edited) void notifyGuardFailure(streamChatId, text);
      else void mirrorTelegramReplyToActivityRoom(text);
    } else {
      void notifyGuardFailure(streamChatId, text);
    }
    return { status: 'failed', error: routeResult.error, conversationId: routeResult.conversationId };
  }

  // Project the reply into the Activity Room (M9) so the /activity surface
  // shows the full turn. Fire-and-forget: mirroring never fails delivery.
  if (routeResult.response) void mirrorTelegramReplyToActivityRoom(routeResult.response);

  return {
    status: 'routed',
    executionId: routeResult.executionId,
    conversationId: routeResult.conversationId,
    response: routeResult.response,
    reply: telegramOk ? 'sent' : 'failed',
  };
}

// ─── Route Handler ─────────────────────────────────────────────

export async function handleTelegramRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  _url: URL,
): Promise<boolean> {
  if (!p.startsWith('/api/telegram')) return false;

  // Ensure workspace context is set for lazy init
  if (!workspaceContext) workspaceContext = ctx;

  try {
    // ─── POST /api/telegram/webhook ─────────────────────────
    if (method === 'POST' && p === '/api/telegram/webhook') {
      const body = await readBody(req);
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }

      const handler = getWebhookHandler();
      const result = await handler.handleWebhook(body, headers);

      if (result.error) {
        json(res, 400, { error: result.error });
        return true;
      }
      if (result.duplicate) {
        json(res, 200, { status: 'duplicate' });
        return true;
      }

      if (result.message) {
        const pipeline = await processTelegramMessage(result.message, ctx);
        json(res, 200, {
          messageId: result.message.id,
          ...pipeline,
        });
        return true;
      }

      if (result.action) {
        // VES-TG-030: forwarded-question taps resolve through the broker;
        // anything else keeps the existing acknowledge behavior.
        if (await dispatchTelegramQuestionTap(ctx, body)) {
          json(res, 200, { status: 'received', channel: 'question' });
          return true;
        }
        json(res, 200, {
          status: 'received',
          actionId: result.action.id,
          callbackData: result.action.callbackData,
        });
        return true;
      }

      json(res, 200, { status: 'accepted' });
      return true;
    }

    // ─── POST /api/telegram/simulate ────────────────────────
    // Simulates a Telegram message without needing a real bot.
    // Accepts { text, userId?, chatId?, displayName? }.
    // Simulated users start UNPAIRED by default: no auto-pairing, no
    // auto workspace binding. Use /start + /pair in the simulator to
    // exercise connecting, sending (unpaired guard), and pairing —
    // the same explicit flow as the real bot path.
    if (method === 'POST' && p === '/api/telegram/simulate') {
      const body = JSON.parse(await readBody(req)) as {
        text?: string;
        userId?: string;
        chatId?: string;
        displayName?: string;
      };

      if (!body.text) {
        json(res, 400, { error: 'text is required' });
        return true;
      }

      const telegramUserId = body.userId ?? 'sim-user-1';
      const chatId = body.chatId ?? `sim-chat-${telegramUserId}`;
      const displayName = body.displayName ?? 'Simulated User';

      // Construct a synthetic Telegram message
      const message: ChannelMessage = {
        id: `sim-msg-${Date.now()}`,
        channel: 'telegram',
        externalMessageId: String(Date.now()),
        sender: {
          channel: 'telegram',
          externalId: telegramUserId,
          displayName,
        },
        conversation: {
          channel: 'telegram',
          externalId: chatId,
          type: 'direct',
        },
        text: body.text,
        timestamp: new Date().toISOString(),
      };

      // No auto-pairing here: simulated users stay unpaired until the
      // explicit /pair → approve flow runs. processTelegramMessage owns
      // the unpaired guard, /start + /pair commands, canonical identity
      // resolution, and workspace auto-bind for approved principals.
      const pipeline = await processTelegramMessage(message, ctx);
      json(res, 200, {
        messageId: message.id,
        simulation: true,
        ...pipeline,
      });
      return true;
    }

    // ─── POST /api/telegram/pairing ─────────────────────────
    if (method === 'POST' && p === '/api/telegram/pairing') {
      const body = JSON.parse(await readBody(req)) as {
        telegramUserId?: string;
        telegramDisplayName?: string;
      };

      if (!body.telegramUserId || !body.telegramDisplayName) {
        json(res, 400, { error: 'telegramUserId and telegramDisplayName required' });
        return true;
      }

      const service = getPairingService();
      const request = service.createPairingRequest(body.telegramUserId, body.telegramDisplayName);

      json(res, 201, {
        pairingId: request.id,
        token: request.token,
        expiresAt: request.expiresAt,
      });
      return true;
    }

    // ─── POST /api/telegram/pairing/approve ─────────────────
    if (method === 'POST' && p === '/api/telegram/pairing/approve') {
      const body = JSON.parse(await readBody(req)) as {
        token?: string;
        principalId?: string;
        principalName?: string;
      };

      if (!body.token || !body.principalId || !body.principalName) {
        json(res, 400, { error: 'token, principalId, and principalName required' });
        return true;
      }

      const service = getPairingService();
      try {
        const binding = service.approvePairing(body.token, body.principalId, body.principalName);
        json(res, 200, {
          bindingId: binding.id,
          telegramUserId: binding.telegramUserId,
          principalId: binding.principalId,
        });
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : 'Pairing failed' });
      }
      return true;
    }

    // ─── POST /api/telegram/enroll ──────────────────────────
    // Explicit operator enrollment for an already-paired Telegram subject.
    // The target canonical principal is caller-selected; no display-name or
    // host identity matching is accepted.
    if (method === 'POST' && p === '/api/telegram/enroll') {
      if (!requireRole(req, ctx, 'admin', res)) return true;
      const body = JSON.parse(await readBody(req)) as {
        telegramUserId?: string;
        principalId?: string;
      };

      if (!body.telegramUserId || !body.principalId) {
        json(res, 400, { error: 'telegramUserId and principalId are required' });
        return true;
      }

      try {
        const enrollment = await enrollTelegramIdentity(
          body.telegramUserId,
          body.principalId,
          getPairingService(),
          ctx.humanPrincipals,
        );
        json(res, 200, {
          status: 'enrolled',
          telegramUserId: enrollment.externalIdentity.subject,
          provider: enrollment.externalIdentity.provider,
          principalId: enrollment.principal.id,
        });
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : 'Enrollment failed' });
      }
      return true;
    }

    // ─── GET /api/telegram/bindings ─────────────────────────
    if (method === 'GET' && p === '/api/telegram/bindings') {
      json(res, 200, {
        pairing: { available: !!pairingService },
        workspaceBindings: { available: !!workspaceBindingService },
        conversationBindings: { available: !!conversationBindingService },
        persistentStore: !!store,
      });
      return true;
    }

    // ─── GET /api/telegram/chats ────────────────────────────
    // Workspace-scoped linked chats for the Activity Room forward picker.
    // Active bindings only — paused/closed chats are never targets.
    if (method === 'GET' && p === '/api/telegram/chats') {
      const service = getConversationBindingService();
      if (!service) {
        json(res, 503, { error: 'Telegram conversation bindings unavailable' });
        return true;
      }
      const workspaceId = path.basename(ctx.repoPath) || 'workspace';
      const chats: ForwardChat[] = service.listActiveBindings(workspaceId).map((b) => ({
        chatId: b.telegramChatId,
        type: b.telegramChatType,
        ...(b.telegramChatTitle ? { title: b.telegramChatTitle } : {}),
        lastActivityAt: b.lastActivityAt,
      }));
      json(res, 200, { chats, configured: !!process.env.TELEGRAM_BOT_TOKEN });
      return true;
    }

    // ─── POST /api/telegram/forward ─────────────────────────
    // Explicit per-message forward from the Activity Room to a linked
    // Telegram chat. No auto-mirroring: nothing leaves the room unless the
    // operator picks a message and a chat. Fail-closed throughout.
    if (method === 'POST' && p === '/api/telegram/forward') {
      const body = JSON.parse(await readBody(req)) as {
        chatId?: unknown;
        text?: unknown;
        activityId?: unknown;
      };

      if (!process.env.TELEGRAM_BOT_TOKEN) {
        json(res, 503, { error: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN missing)' });
        return true;
      }
      const service = getConversationBindingService();
      if (!service) {
        json(res, 503, { error: 'Telegram conversation bindings unavailable' });
        return true;
      }
      const workspaceId = path.basename(ctx.repoPath) || 'workspace';
      const bindings = service.listActiveBindings(workspaceId);
      const chatId = typeof body.chatId === 'string' ? body.chatId : undefined;
      const target = resolveForwardTarget(bindings, chatId);
      if (!target.ok) {
        const status = target.code === 'UNKNOWN_CHAT' ? 404 : target.code === 'AMBIGUOUS_CHAT' ? 409 : 404;
        json(res, status, {
          error: target.message,
          code: target.code,
          chats: bindings.map((b) => ({
            chatId: b.telegramChatId,
            type: b.telegramChatType,
            ...(b.telegramChatTitle ? { title: b.telegramChatTitle } : {}),
            lastActivityAt: b.lastActivityAt,
          })),
        });
        return true;
      }

      // Resolve content: explicit text wins, otherwise server-truth lookup.
      let text = typeof body.text === 'string' ? body.text.trim() : '';
      const activityId = typeof body.activityId === 'string' ? body.activityId.trim() : '';
      if (!text && activityId) {
        try {
          const { getM11ARoom } = await import('./activity-room-m11a.js');
          const record = await getM11ARoom().store.getByActivityId(activityId);
          if (!record) {
            json(res, 404, { error: `Activity not found: ${activityId}` });
            return true;
          }
          const content = record.payload?.message ?? record.payload?.output ?? record.type;
          const actor = record.actor?.displayName?.trim() ? record.actor.displayName : 'Room';
          text = `[${actor}] ${content}`.trim();
        } catch {
          json(res, 503, { error: 'Activity store unavailable' });
          return true;
        }
      }
      if (!text) {
        json(res, 400, { error: 'text or activityId is required' });
        return true;
      }
      if (text.length > FORWARD_MAX_TEXT_LENGTH) {
        json(res, 400, { error: `text exceeds ${FORWARD_MAX_TEXT_LENGTH} characters` });
        return true;
      }

      const binding = target.binding;
      const adapter = new TelegramAdapter({ botToken: process.env.TELEGRAM_BOT_TOKEN as string });
      let sent = 0;
      const chunks = splitTelegramText(text);
      let lastError: string | undefined;
      for (const chunk of chunks) {
        const result = await adapter.sendDelivery({
          id: `tg-forward-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel: 'telegram',
          conversation: {
            channel: 'telegram',
            externalId: binding.telegramChatId,
            type: binding.telegramChatType === 'group' ? 'group' : 'direct',
            title: binding.telegramChatTitle,
          },
          content: { text: chunk },
          priority: 'normal',
        });
        if (result.success) sent += 1;
        else lastError = result.error ?? 'Telegram API error';
      }
      if (sent > 0) {
        try {
          service.touchBinding(binding.id);
        } catch {
          /* recency bookkeeping is best-effort */
        }
      }
      if (sent === chunks.length) {
        // Mirror the outbound copy into the Room so the send is visible on
        // the /activity surface. Fire-and-forget: mirroring never fails
        // delivery or the forward response.
        const operator = authenticate(req, ctx.users);
        void mirrorTelegramForwardToActivityRoom(binding.telegramChatId, text, {
          id: operator?.id ?? 'local-operator',
          name: operator?.name ?? 'local-operator',
        });
        json(res, 200, { status: 'sent', chatId: binding.telegramChatId, chunks: { sent, total: chunks.length } });
      } else {
        json(res, 502, {
          status: 'failed',
          chatId: binding.telegramChatId,
          chunks: { sent, total: chunks.length },
          error: lastError ?? 'Telegram delivery failed',
        });
      }
      return true;
    }

    // ─── GET /api/telegram/status ───────────────────────────
    if (method === 'GET' && p === '/api/telegram/status') {
      json(res, 200, {
        configured: !!process.env.TELEGRAM_BOT_TOKEN,
        persistentStore: !!store,
        services: {
          pairing: !!pairingService,
          workspaceBindings: !!workspaceBindingService,
          conversationBindings: !!conversationBindingService,
          textRouter: !!textRouter,
        },
      });
      return true;
    }

    // ─── GET /api/telegram/settings ─────────────────────────
    // TG-023: read model for the Settings → Telegram integration panel.
    // The event catalog is served from the package so the UI never hardcodes
    // notification types.
    if (method === 'GET' && p === '/api/telegram/settings') {
      const activation = resolveTelegramActivation(process.env.VESTARA_RUNTIME_PROFILE);
      const tunnel = getTunnelService();
      json(res, 200, {
        notifications: notificationPolicy.getPreferences('default'),
        eventCatalog: NOTIFICATION_EVENT_CATALOG,
        integration: {
          enabled: activation.enabled,
          configured: !!process.env.TELEGRAM_BOT_TOKEN,
          persistentStore: !!store,
          runtimeProfile: activation.profile,
        },
        tunnel: {
          config: tunnel.getConfig(),
          state: tunnel.getState(),
          availability: await resolveTunnelAvailability(),
        },
      });
      return true;
    }

    // ─── PUT /api/telegram/settings ─────────────────────────
    // Accepts { notifications } and validates through the package
    // normalizer. Unknown fields are dropped; the response echoes the
    // normalized, persisted result so the UI is never out of sync.
    if (method === 'PUT' && p === '/api/telegram/settings') {
      const body = JSON.parse(await readBody(req)) as { notifications?: unknown };
      const normalized = normalizeNotificationPreferences(body.notifications);
      notificationPolicy.setPreferences('default', normalized);
      store?.saveSettings(NOTIFICATION_SETTINGS_KEY, normalized);
      json(res, 200, { notifications: normalized });
      return true;
    }

    // ─── GET /api/telegram/tunnel ───────────────────────────
    // TG-030: webhook tunnel read model (configuration + runtime state).
    if (method === 'GET' && p === '/api/telegram/tunnel') {
      const tunnel = getTunnelService();
      json(res, 200, {
        config: tunnel.getConfig(),
        state: tunnel.getState(),
        availability: await resolveTunnelAvailability(),
      });
      return true;
    }

    // ─── PUT /api/telegram/tunnel ───────────────────────────
    // Configure and/or start/stop the tunnel. Configuration is persisted;
    // runtime state is not. Requests can enable/disable explicitly; a
    // non-manual tunnel also auto-enables on API boot (see initTelegramRoute).
    if (method === 'PUT' && p === '/api/telegram/tunnel') {
      const body = JSON.parse(await readBody(req)) as {
        enabled?: unknown;
        provider?: unknown;
        publicUrl?: unknown;
        localPort?: unknown;
      };

      const provider = TUNNEL_PROVIDER_KINDS.includes(body.provider as TunnelProviderKind)
        ? (body.provider as TunnelProviderKind)
        : undefined;
      const publicUrl = typeof body.publicUrl === 'string' ? body.publicUrl.trim() : undefined;
      const localPort =
        typeof body.localPort === 'number' &&
        Number.isInteger(body.localPort) &&
        body.localPort > 0 &&
        body.localPort <= 65535
          ? body.localPort
          : undefined;

      if (provider !== undefined || publicUrl !== undefined || localPort !== undefined) {
        await getTunnelService().configure({
          ...(provider !== undefined ? { provider } : {}),
          ...(publicUrl !== undefined ? { publicUrl } : {}),
          ...(localPort !== undefined ? { localPort } : {}),
        });
        tunnelConfig = {
          ...tunnelConfig,
          ...(provider !== undefined ? { provider } : {}),
          ...(publicUrl !== undefined ? { publicUrl } : {}),
          ...(localPort !== undefined ? { localPort } : {}),
        };
        store?.saveSettings(TUNNEL_SETTINGS_KEY, {
          provider: tunnelConfig.provider,
          publicUrl: tunnelConfig.publicUrl,
          localPort: tunnelConfig.localPort,
        });
      }

      if (body.enabled === true) {
        await getTunnelService().enable();
      } else if (body.enabled === false) {
        await getTunnelService().disable();
      }

      const tunnel = getTunnelService();
      json(res, 200, {
        config: tunnel.getConfig(),
        state: tunnel.getState(),
        availability: await resolveTunnelAvailability(),
      });
      return true;
    }

    return false;
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error',
    });
    return true;
  }
}
