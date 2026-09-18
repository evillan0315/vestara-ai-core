/**
 * @vestara/api — Workspace Runtime HTTP + WebSocket gateway
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 *   Runtime: VESTARA-KERNEL.md → Boot Sequence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { M9IngestionBridge } from '@vestara/activity-room';
import { deliverPendingCINotifications } from '@vestara/ci-observer';
import type { WorkspaceEvent } from '@vestara/events';
import { initActivityRoom } from './activity-room';
import { createAgentLifecycleBridge } from './bridges/agent-lifecycle-bridge';
import { reconcileStaleCIWaits } from './ci-reconcile';
import { startOpencodeSupervisor } from './opencode-supervisor';
import { getM11ARoom, initM11AActivityRoom } from './routes/activity-room-m11a';
import { collectCIWaits } from './routes/ci';
import { initTelegramRoute, resolveTelegramActivation } from './routes/telegram';
import { type ApiServer, createServer } from './server';
import { createWorkspaceContext } from './workspace-context';

// ─── Boot Waterfall Instrumentation ───────────────────────
const BOOT_T0 = process.hrtime.bigint();
const bootLog: Array<{ phase: string; elapsedMs: number }> = [];
function bootMark(phase: string): void {
  const ns = process.hrtime.bigint() - BOOT_T0;
  const ms = Number(ns) / 1_000_000;
  bootLog.push({ phase, elapsedMs: Math.round(ms) });
  console.log(`[boot] ${phase} — ${Math.round(ms)}ms`);
}
bootMark('process-spawned');

/**
 * Resolve the repo root relative to the API server's own location.
 *
 * The compiled server lives at `apps/api/dist/index.js`, so the project
 * root is two levels up: `apps/api/dist/` → `apps/api/` → project root.
 * We walk upward from there looking for `.vestara/workspace.json`.
 *
 * The `VESTARA_REPO` env var overrides the search entirely.
 */
function resolveRepoRoot(envOverride?: string): string {
  if (envOverride) return path.resolve(envOverride);
  // __dirname = apps/api/dist/ in compiled output.
  // Start one level above apps/api/ to avoid finding the API's own .vestara/.
  let dir = path.resolve(__dirname, '..', '..');
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.vestara', 'workspace.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback to the directory containing the API
  return path.resolve(__dirname, '..', '..');
}

async function main(): Promise<void> {
  bootMark('entrypoint-entered');
  const port = Number(process.env.VESTARA_API_PORT ?? 3001);
  const repoPath = resolveRepoRoot(process.env.VESTARA_REPO);
  bootMark('config-loaded');

  const pending: WorkspaceEvent[] = [];
  let broadcast: ((e: WorkspaceEvent) => void) | null = null;

  const publish = (event: WorkspaceEvent): void => {
    if (broadcast) broadcast(event);
    else pending.push(event);
  };

  console.log(`[api] opening workspace at ${repoPath}...`);
  bootMark('composition-begin');
  const ctx = await createWorkspaceContext(repoPath, publish);
  bootMark('composition-end');

  await initActivityRoom(repoPath);
  bootMark('activity-room-init');

  await initM11AActivityRoom(repoPath);
  bootMark('m11a-init');

  // VES-LEAN-003A: Gate Telegram by dogfood profile
  if (resolveTelegramActivation(process.env.VESTARA_RUNTIME_PROFILE).enabled) {
    await initTelegramRoute(path.join(repoPath, '.vestara', 'telegram.db'), ctx);
  }
  bootMark('telegram-init');

  // M11C-I1: Start M9 ingestion bridge — single EventBus → M9 write boundary
  const m11aRoom = getM11ARoom();
  const m9Bridge = new M9IngestionBridge({
    store: m11aRoom.store,
    eventBus: ctx.kernel.eventBus,
    logger: ctx.kernel.logger,
    // Phase A: canonical agent-identity resolver for the fail-closed
    // human-message guard (a turn target leaked into userId must never
    // manufacture a Human participant). Same AgentStorage authority as
    // the lifecycle bridge below.
    agentIdResolver: {
      async isCanonicalAgentId(id: string): Promise<boolean> {
        try {
          const stored = await ctx.agents.listAgents();
          return stored.some((a) => a.id === id);
        } catch {
          return false;
        }
      },
    },
  });
  m9Bridge.start();
  bootMark('m9-bridge-started');

  // ARX-015: Agent lifecycle bridge — maps harness.* → canonical agent:started/completed
  // for M9 ingestion. Resolves model metadata from AgentStorage so participants
  // display the assigned model name rather than a generic role label.
  const _unsubAgentLifecycle = createAgentLifecycleBridge({
    eventBus: ctx.kernel.eventBus,
    agentModelResolver: {
      async resolve({ agentId }) {
        try {
          const stored = await ctx.agents.listAgents();
          const agent = stored.find((a) => a.id === agentId || a.runtimeAgent === agentId || a.role === agentId);
          if (agent) {
            return {
              providerId: agent.provider || undefined,
              modelId: agent.model || undefined,
              role: agent.role || agentId,
              displayName: agent.name || agentId,
              modelDisplayName: agent.model || agent.name || agentId,
            };
          }
        } catch {
          /* best-effort */
        }
        return undefined;
      },
    },
  });
  bootMark('agent-lifecycle-bridge-started');

  // Idle-based OpenCode stop + on-demand restart (releases ~526 MB when idle).
  if (process.env.VESTARA_OPENCODE_SUPERVISOR !== '0') {
    startOpencodeSupervisor();
    console.log(
      `[api] opencode supervisor active (idle stop ${process.env.VESTARA_OPENCODE_IDLE_STOP_MS ?? 1800000} ms)`,
    );
  }
  bootMark('opencode-supervisor');

  // H7: periodic reconciliation of stale CI waits (attach a lost provider run).
  // Disabled by default; opt in with VESTARA_CI_RECONCILE_INTERVAL_MS.
  const reconcileIntervalMs = Number(process.env.VESTARA_CI_RECONCILE_INTERVAL_MS ?? 0);
  let ciReconcileTimer: ReturnType<typeof setInterval> | undefined;
  if (Number.isFinite(reconcileIntervalMs) && reconcileIntervalMs > 0 && process.env.GITHUB_TOKEN) {
    ciReconcileTimer = setInterval(() => {
      void (async () => {
        try {
          const correlation = await collectCIWaits(ctx);
          const summary = await reconcileStaleCIWaits(ctx, correlation.waits);
          if (summary.stale > 0) {
            console.log(
              `[ci] reconciliation: stale=${summary.stale} attached=${summary.attached} held=${summary.held}`,
            );
          }
        } catch (error) {
          console.warn('[ci] reconciliation failed', error);
        }
      })();
    }, reconcileIntervalMs);
    ciReconcileTimer.unref?.();
    bootMark('ci-reconcile-scheduled');
  }

  // CI-OBS-001I: drain the notification outbox to configured sinks. Opt in
  // with VESTARA_CI_NOTIFY_INTERVAL_MS. A console sink is the default channel;
  // real channels (Telegram/UI) plug additional sinks without changing drain
  // semantics.
  const notifyIntervalMs = Number(process.env.VESTARA_CI_NOTIFY_INTERVAL_MS ?? 0);
  let ciNotifyTimer: ReturnType<typeof setInterval> | undefined;
  if (Number.isFinite(notifyIntervalMs) && notifyIntervalMs > 0 && ctx.ciRecords.notifications) {
    const notifications = ctx.ciRecords.notifications;
    const consoleSink = {
      id: 'console',
      async deliver(notification: {
        readonly severity: string;
        readonly title: string;
        readonly body: string;
      }): Promise<void> {
        console.log(`[ci:notify] ${notification.severity} · ${notification.title} — ${notification.body}`);
      },
    };
    ciNotifyTimer = setInterval(() => {
      void deliverPendingCINotifications(notifications, [consoleSink])
        .then((summary) => {
          if (summary.delivered > 0) console.log(`[ci] delivered ${summary.delivered} notification(s)`);
        })
        .catch(() => undefined);
    }, notifyIntervalMs);
    ciNotifyTimer.unref?.();
    bootMark('ci-notify-scheduled');
  }

  const server = createServer(ctx, port) as ApiServer;
  broadcast = (e) => server.broadcast(e);
  for (const e of pending) server.broadcast(e);
  bootMark('routes-registered');

  server.listen(port, () => {
    bootMark('http-listening');
    console.log(`[api] listening on http://127.0.0.1:${port}`);
    console.log(`[api] websocket ws://127.0.0.1:${port}/ws`);
    console.log(`[api] health   http://127.0.0.1:${port}/api/health`);

    // Print final waterfall
    console.log('\n[boot] ═══ STARTUP WATERFALL ═══');
    const totalMs = bootLog[bootLog.length - 1].elapsedMs;
    let prevMs = 0;
    for (const entry of bootLog) {
      const deltaMs = entry.elapsedMs - prevMs;
      console.log(
        `[boot]   ${entry.phase.padEnd(30)} ${String(entry.elapsedMs).padStart(6)}ms  (+${String(deltaMs).padStart(5)}ms)`,
      );
      prevMs = entry.elapsedMs;
    }
    console.log(`[boot]   ${'─'.repeat(48)}`);
    console.log(`[boot]   ${'TOTAL'.padEnd(30)} ${String(totalMs).padStart(6)}ms`);
    console.log('[boot] ════════════════════════════\n');
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} — shutting down`);
    const shutdownStart = process.hrtime.bigint();
    if (ciReconcileTimer) clearInterval(ciReconcileTimer);
    if (ciNotifyTimer) clearInterval(ciNotifyTimer);
    server.close();
    await ctx.close();
    const shutdownMs = Math.round(Number(process.hrtime.bigint() - shutdownStart) / 1_000_000);
    console.log(`[api] shutdown complete in ${shutdownMs}ms`);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
