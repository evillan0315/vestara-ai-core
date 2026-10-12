/**
 * VOS-STARTUP-001 P3: Onboarding marker hookup.
 *
 * The XFCE session launcher (`os/customization/login/`) resolves its
 * startup entry from marker files. No onboarding flow exists yet, so this
 * module is the completion authority the future flow (or an operator) calls:
 * - POST /api/onboarding/begin → first boot started, entry resolves to
 *   `onboarding`
 * - POST /api/onboarding/complete → onboarding done, entry resolves to
 *   `login` and never re-prompts
 * - GET /api/onboarding/status → current marker state (no mutation)
 *
 * Marker directory is `VESTARA_ONBOARDING_MARKER_DIR` when set (the image
 * builder points it at /var/lib/vestara/onboarding, writable by the API
 * user and readable by the desktop user), otherwise `<repo>/.vestara/
 * onboarding` (gitignored runtime state). Filenames are fixed — request
 * input never touches the filesystem, so traversal is impossible by
 * construction. All three paths require authentication via the central
 * /api/* enforcement in server.ts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type * as http from 'node:http';
import { join } from 'node:path';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

const COMPLETE_FILE = 'onboarding-complete';
const PENDING_FILE = 'onboarding-pending';

export function resolveOnboardingMarkerDir(
  ctx: Pick<WorkspaceContext, 'repoPath'>,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env['VESTARA_ONBOARDING_MARKER_DIR'];
  if (override !== undefined && override.trim().length > 0) return override;
  return join(ctx.repoPath, '.vestara', 'onboarding');
}

function readStatus(dir: string): { completed: boolean; pending: boolean } {
  const completed = existsSync(join(dir, COMPLETE_FILE));
  return { completed, pending: !completed && existsSync(join(dir, PENDING_FILE)) };
}

export async function handleOnboardingRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (p !== '/api/onboarding/status' && p !== '/api/onboarding/begin' && p !== '/api/onboarding/complete') {
    return false;
  }
  const dir = resolveOnboardingMarkerDir(ctx);
  if (method === 'GET' && p === '/api/onboarding/status') {
    json(res, 200, { ...readStatus(dir), markerDir: dir });
    return true;
  }
  if (method === 'POST' && (p === '/api/onboarding/begin' || p === '/api/onboarding/complete')) {
    try {
      mkdirSync(dir, { recursive: true });
      if (p === '/api/onboarding/begin') {
        rmSync(join(dir, COMPLETE_FILE), { force: true });
        writeFileSync(join(dir, PENDING_FILE), `${new Date().toISOString()}\n`);
      } else {
        rmSync(join(dir, PENDING_FILE), { force: true });
        writeFileSync(join(dir, COMPLETE_FILE), `${new Date().toISOString()}\n`);
      }
    } catch {
      json(res, 500, {
        error: { code: 'ONBOARDING_MARKER_WRITE_FAILED', message: 'Unable to persist the onboarding marker.' },
      });
      return true;
    }
    json(res, 200, { ...readStatus(dir), markerDir: dir });
    return true;
  }
  return false;
}
