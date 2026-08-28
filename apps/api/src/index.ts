/**
 * @vestara/api — Workspace Runtime HTTP + WebSocket gateway
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 *   Runtime: VESTARA-KERNEL.md → Boot Sequence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { M9IngestionBridge } from '@vestara/activity-projection';
import type { WorkspaceEvent } from '@vestara/events';
import { initActivityRoom } from './activity-room';
import { startOpencodeSupervisor } from './opencode-supervisor';
import { getM11ARoom, initM11AActivityRoom } from './routes/activity-room-m11a';
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

  // M11C-I1: Start M9 ingestion bridge — single EventBus → M9 write boundary
  const m11aRoom = getM11ARoom();
  const m9Bridge = new M9IngestionBridge({
    store: m11aRoom.store,
    eventBus: ctx.kernel.eventBus,
    logger: ctx.kernel.logger,
  });
  m9Bridge.start();
  bootMark('m9-bridge-started');

  // Idle-based OpenCode stop + on-demand restart (releases ~526 MB when idle).
  if (process.env.VESTARA_OPENCODE_SUPERVISOR !== '0') {
    startOpencodeSupervisor();
    console.log(
      `[api] opencode supervisor active (idle stop ${process.env.VESTARA_OPENCODE_IDLE_STOP_MS ?? 1800000} ms)`,
    );
  }
  bootMark('opencode-supervisor');

  const server = createServer(ctx, port, ctx.activityService) as ApiServer;
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
