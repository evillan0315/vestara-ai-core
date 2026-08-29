/**
 * Sequential route dispatcher.
 *
 * Candidates are executed in registration order and dispatch stops at the
 * first handler that returns `true`, reproducing the original server's
 * linear dispatch chain exactly. Prefixes narrow the candidate set without
 * changing which handler wins, so overlapping paths (e.g. the agent-harness
 * handler owning `/api/agents/:id/runs` while the agents group owns
 * `/api/agents`) resolve identically to the sequential chain.
 *
 * Handlers keep the existing signature `(method, pathname, req, res, ctx,
 * port, url) => Promise<boolean>`. Per-request context is available through
 * `requestContext` (AsyncLocalStorage) rather than a positional parameter, so
 * downstream code can log with the active request ID without a signature
 * change.
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { sendNotFound } from './response';

export type RouteHandler = (
  method: string,
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  port: number,
  url: URL,
) => Promise<boolean>;

export interface RouteGroup {
  prefix: string;
  handler: RouteHandler;
}

export interface RouteMatch {
  group: RouteGroup;
  /** Methods the group handles, when declared. */
  methods?: string[];
}

export interface RouteDispatcherOptions {
  /** Declared per-pathport method constraints for 405 support. */
  methodRegistry?: Record<string, string[]>;
}

export class RouteDispatcher {
  private readonly groups: RouteGroup[];
  private readonly methodRegistry: Record<string, string[]>;

  constructor(groups: RouteGroup[], options: RouteDispatcherOptions = {}) {
    // Preserve registration order: matches the original sequential dispatch
    // contract, so overlapping prefixes resolve exactly as before.
    this.groups = [...groups];
    this.methodRegistry = options.methodRegistry ?? {};
  }

  candidates(pathname: string): RouteGroup[] {
    return this.groups.filter((group) => pathname.startsWith(group.prefix));
  }

  /**
   * Execute candidates in registration order. Returns true if a handler
   * claimed the request. If no handler claims it, sends a standardized 404.
   */
  async dispatch(
    method: string,
    pathname: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ctx: WorkspaceContext,
    port: number,
    url: URL,
  ): Promise<void> {
    for (const group of this.groups) {
      const handled = await group.handler(method, pathname, req, res, ctx, port, url);
      if (handled) return;
    }
    // No handler claimed the request. Emit a 405 when we know the resource
    // exists but the method is not supported.
    const allowed = this.methodRegistry[pathname];
    if (allowed && !allowed.includes(method)) {
      sendNotFound(res);
      return;
    }
    sendNotFound(res);
  }

  /** Check whether any group owns the pathname (for method-aware handling). */
  owns(pathname: string): boolean {
    return this.candidates(pathname).length > 0;
  }
}

export function createDispatcher(groups: RouteGroup[], options?: RouteDispatcherOptions): RouteDispatcher {
  return new RouteDispatcher(groups, options);
}
