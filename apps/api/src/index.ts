/**
 * @vestara/api — Workspace Runtime HTTP + WebSocket gateway
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 *   Runtime: VESTARA-KERNEL.md → Boot Sequence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkspaceEvent } from '@vestara/events';
import { initActivityRoom } from './activity-room';
import { startOpencodeSupervisor } from './opencode-supervisor';
import { type ApiServer, createServer } from './server';
import { createWorkspaceContext } from './workspace-context';

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
  const port = Number(process.env.VESTARA_API_PORT ?? 3001);
  const repoPath = resolveRepoRoot(process.env.VESTARA_REPO);

  const pending: WorkspaceEvent[] = [];
  let broadcast: ((e: WorkspaceEvent) => void) | null = null;

  const publish = (event: WorkspaceEvent): void => {
    if (broadcast) broadcast(event);
    else pending.push(event);
  };

  console.log(`[api] opening workspace at ${repoPath}...`);
  const ctx = await createWorkspaceContext(repoPath, publish);
  await initActivityRoom(repoPath);

  // Idle-based OpenCode stop + on-demand restart (releases ~526 MB when idle).
  if (process.env.VESTARA_OPENCODE_SUPERVISOR !== '0') {
    startOpencodeSupervisor();
    console.log(
      `[api] opencode supervisor active (idle stop ${process.env.VESTARA_OPENCODE_IDLE_STOP_MS ?? 1800000} ms)`,
    );
  }

  const server = createServer(ctx, port, ctx.activityService) as ApiServer;
  broadcast = (e) => server.broadcast(e);
  for (const e of pending) server.broadcast(e);

  server.listen(port, () => {
    console.log(`[api] listening on http://127.0.0.1:${port}`);
    console.log(`[api] websocket ws://127.0.0.1:${port}/ws`);
    console.log(`[api] health   http://127.0.0.1:${port}/api/health`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} — shutting down`);
    server.close();
    await ctx.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
