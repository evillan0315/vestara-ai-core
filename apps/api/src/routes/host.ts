import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleHostRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/host') {
    if (!ctx.hostRuntime) {
      json(res, 503, {
        error: { code: 'CAPABILITY_DISABLED', message: 'Host Runtime is not active in this profile.' },
      });
      return true;
    }
    json(res, 200, { runtime: ctx.hostRuntime.info, host: await ctx.hostRuntime.inspectHost() });
    return true;
  }
  if (method === 'GET' && p === '/api/boot') {
    if (!ctx.bootRuntime) {
      json(res, 503, {
        error: { code: 'CAPABILITY_DISABLED', message: 'Boot Runtime is not active in this profile.' },
      });
      return true;
    }
    json(res, 200, {
      runtime: ctx.bootRuntime.info,
      boot: ctx.bootRuntime.current(),
      previous: ctx.bootRuntime.lastBoot(),
    });
    return true;
  }
  return false;
}
