/**
 * @vestara/api — Workspace Runtime HTTP + WebSocket gateway
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 *   Runtime: VESTARA-KERNEL.md → Boot Sequence
 */

import type { WorkspaceEvent } from '@vestara/events';
import { type ApiServer, createServer } from './server';
import { createWorkspaceContext } from './workspace-context';

async function main(): Promise<void> {
  const port = Number(process.env.VESTARA_API_PORT ?? 3001);
  const repoPath = process.env.VESTARA_REPO ?? process.cwd();

  const pending: WorkspaceEvent[] = [];
  let broadcast: ((e: WorkspaceEvent) => void) | null = null;

  const publish = (event: WorkspaceEvent): void => {
    if (broadcast) broadcast(event);
    else pending.push(event);
  };

  console.log(`[api] opening workspace at ${repoPath}...`);
  const ctx = await createWorkspaceContext(repoPath, publish);

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
