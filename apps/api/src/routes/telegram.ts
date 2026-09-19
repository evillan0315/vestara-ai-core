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
 *   GET  /api/telegram/bindings       — List all bindings (diagnostic)
 *   GET  /api/telegram/status         — Get Telegram integration status
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform
 */

import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import type { ChannelMessage, ConversationBinding } from '@vestara/telegram-integration';
import {
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

/** Settings key for the operator-scoped notification preferences (TG-018/023). */
const NOTIFICATION_SETTINGS_KEY = 'notifications:default';

/** Settings key for the persisted webhook tunnel configuration. */
const TUNNEL_SETTINGS_KEY = 'tunnel:default';

const notificationPolicy = new TelegramNotificationPolicy();

// ─── Tunnel (TG-030) ───────────────────────────────────────────

const TUNNEL_PROVIDER_KINDS: readonly TunnelProviderKind[] = ['manual', 'cloudflared', 'ngrok'];

function initialTunnelConfig(): TunnelConfig {
  return {
    ...DEFAULT_TUNNEL_CONFIG,
    localPort: Number(process.env.VESTARA_API_PORT ?? process.env.PORT ?? 3001),
  };
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

function getPairingService(): TelegramPairingService {
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
          const result = await ctx.conversationService.sendMessage(conversationId, content, {
            agentId: binding.agentId,
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

  store = new TelegramPersistentStore(db);

  // Rehydrate operator notification preferences (TG-018/023).
  const storedNotifications = store.getSettings(NOTIFICATION_SETTINGS_KEY);
  if (storedNotifications !== undefined) {
    notificationPolicy.setPreferences('default', storedNotifications);
  }

  // Rehydrate tunnel configuration (TG-030). Tunnel *state* is runtime-only:
  // persisted configuration never spawns a process on boot.
  const storedTunnel = store.getSettings(TUNNEL_SETTINGS_KEY) as Partial<TunnelConfig> | undefined;
  if (storedTunnel !== undefined) {
    tunnelConfig = { ...initialTunnelConfig(), ...storedTunnel };
  }
  tunnelService = null;

  // Re-initialize services with the persistent store
  webhookHandler = null;
  pairingService = new TelegramPairingService({ store });
  workspaceBindingService = new TelegramWorkspaceBindingService({ store });
  conversationBindingService = new TelegramConversationBindingService({ store });
  textRouter = null; // will be recreated with backend on first use

  console.log('[telegram] route initialized with persistent store');
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
    const [{ getM11ARoom }, { fromHumanMessage }] = await Promise.all([
      import('./activity-room-m11a.js'),
      import('@vestara/activity-room'),
    ]);
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
    const [{ getM11ARoom }, { fromAgentLifecycle }] = await Promise.all([
      import('./activity-room-m11a.js'),
      import('@vestara/activity-room'),
    ]);
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
 * Process a normalized Telegram message through the full pipeline:
 * 1. Resolve identity binding (Telegram user -> Vestara principal)
 * 2. Resolve workspace binding (principal -> workspace)
 * 3. Resolve or create conversation binding (chat -> Vestara conversation)
 * 4. Route through GlobalAssistantTextRouter
 * 5. Return the execution result
 */
async function processTelegramMessage(
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

  // 1. Resolve identity
  const telegramUserId = message.sender.externalId;
  const identity = pairing.getBindingByTelegramId(telegramUserId);
  if (!identity) {
    return {
      status: 'unpaired',
      error: `Telegram user ${telegramUserId} is not paired. Use /pair to link your account.`,
    };
  }

  // 2. Resolve workspace
  const workspace = wsBindings.getPreferredWorkspace(identity.principalId);
  if (!workspace) {
    return {
      status: 'no-workspace',
      error: `No workspace bound for principal ${identity.principalId}.`,
    };
  }

  // 3. Resolve or create conversation binding, scoped to the resolved
  // workspace so a chat bound elsewhere can never leak across workspaces.
  const chatId = message.conversation.externalId;
  let conversation = convBindings.getActiveBinding(chatId, identity.principalId, workspace.workspaceId);

  if (!conversation) {
    // Auto-create a new Vestara conversation
    if (!convBindings.canCreateConversation(chatId)) {
      return {
        status: 'conversation-limit',
        error: 'Maximum conversations per chat reached.',
      };
    }

    // Create a new Vestara conversation
    const vestaraConv = await ctx.conversationService.createConversation(identity.principalId);
    conversation = convBindings.createBinding({
      principalId: identity.principalId,
      workspaceId: workspace.workspaceId,
      telegramChatId: chatId,
      telegramChatType: message.conversation.type === 'channel' ? 'group' : message.conversation.type,
      telegramChatTitle: message.conversation.title,
      vestaraConversationId: vestaraConv.id,
      vestaraConversationTitle: vestaraConv.title,
    });
  }

  // 4. Route through text router
  if (!router) {
    return {
      status: 'not-configured',
      error: 'Telegram text router not initialized.',
    };
  }

  const routeResult = await router.routeMessage(message, identity, workspace, conversation);

  if (routeResult.status === 'queued') {
    return { status: 'queued', conversationId: routeResult.conversationId };
  }
  if (routeResult.status === 'rejected') {
    return { status: 'rejected', error: routeResult.error, conversationId: routeResult.conversationId };
  }
  if (routeResult.status === 'failed') {
    return { status: 'failed', error: routeResult.error, conversationId: routeResult.conversationId };
  }

  // 5. Deliver the assistant reply to the Telegram chat. The webhook HTTP
  // response body is ignored by Telegram — without this Bot API call the
  // user would never see the reply.
  const reply = await deliverTelegramReply(conversation, routeResult.response);

  // Project the reply into the Activity Room (M9) so the /activity surface
  // shows the full turn. Fire-and-forget: mirroring never fails delivery.
  if (routeResult.response) void mirrorTelegramReplyToActivityRoom(routeResult.response);

  return {
    status: 'routed',
    executionId: routeResult.executionId,
    conversationId: routeResult.conversationId,
    response: routeResult.response,
    reply,
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

      // Auto-pair if not already paired
      const pairing = getPairingService();
      if (!pairing.isPaired(telegramUserId)) {
        // Auto-approve for simulation mode
        const request = pairing.createPairingRequest(telegramUserId, displayName);
        const principalId = `sim-principal-${telegramUserId}`;
        pairing.approvePairing(request.token, principalId, displayName);

        // Auto-bind to current workspace
        const wsBindings = getWorkspaceBindingService();
        const currentWorkspaceId = path.basename(ctx.repoPath) || 'workspace';
        const currentWorkspaceName = currentWorkspaceId;
        try {
          wsBindings.bindWorkspace(principalId, currentWorkspaceId, currentWorkspaceName);
        } catch {
          // already bound — ignore
        }
      }

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
    // runtime state is not. Enabling is always an explicit request.
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
