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
  GlobalAssistantTextRouter,
  TELEGRAM_MANIFEST,
  TelegramAdapter,
  TelegramConversationBindingService,
  TelegramPairingService,
  TelegramPersistentStore,
  TelegramWebhookHandler,
  TelegramWorkspaceBindingService,
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
          const result = await ctx.conversationService.sendMessage(conversationId, content, {
            model: options?.model,
            provider: options?.provider,
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

    return false;
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error',
    });
    return true;
  }
}
