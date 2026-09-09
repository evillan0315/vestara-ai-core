/**
 * Context Intelligence API routes.
 *
 * Provides context retrieval, ranking, and assembly endpoints:
 *   POST /api/context/retrieve        → retrieve context for a query
 *   POST /api/context/preflight       → developer preflight (assemble context before execution)
 *   POST /api/context/change-aware    → change-aware retrieval (given a diff/commit)
 *   GET  /api/context/stats           → context intelligence statistics
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleContextRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://127.0.0.1');

  // ─── POST /api/context/retrieve ──────────────────────────────
  if (method === 'POST' && p === '/api/context/retrieve') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const { ContextIntelligenceEngine } = await import('@vestara/context-intelligence');

      const engine = new ContextIntelligenceEngine({
        budget: {
          totalTokens: body.tokenBudget ?? 8000,
        },
      });

      // Register source adapters (placeholder implementations)
      // In production, these would connect to actual data sources
      engine.registerSource({
        sourceType: 'diagnostics',
        retrieve: async (query) => {
          // Placeholder: return empty results
          // Real implementation would query diagnostic snapshots
          return [];
        },
      });

      engine.registerSource({
        sourceType: 'evidence',
        retrieve: async (query) => {
          // Placeholder: return empty results
          // Real implementation would query evidence bundles
          return [];
        },
      });

      const result = await engine.retrieveContext({
        query: body.query ?? '',
        sourceTypes: body.sourceTypes,
        maxResults: body.maxResults,
        tokenBudget: body.tokenBudget,
        newerThan: body.newerThan,
      });

      json(res, 200, result);
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  // ─── POST /api/context/preflight ─────────────────────────────
  if (method === 'POST' && p === '/api/context/preflight') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const { ContextIntelligenceEngine } = await import('@vestara/context-intelligence');

      const engine = new ContextIntelligenceEngine();

      // Register placeholder source adapters
      engine.registerSource({
        sourceType: 'engineering-graph',
        retrieve: async () => [],
      });

      engine.registerSource({
        sourceType: 'evidence',
        retrieve: async () => [],
      });

      engine.registerSource({
        sourceType: 'diagnostics',
        retrieve: async () => [],
      });

      const startTime = Date.now();
      const context = await engine.retrieveContext({
        query: body.task ?? '',
        sourceTypes: body.sourceTypes,
        tokenBudget: body.tokenBudget ?? 16000,
      });

      json(res, 200, {
        context,
        metadata: {
          assembledAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          totalTokens: context.totalTokens,
          budgetUsed: context.totalTokens,
        },
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  // ─── POST /api/context/change-aware ──────────────────────────
  if (method === 'POST' && p === '/api/context/change-aware') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const { ContextIntelligenceEngine } = await import('@vestara/context-intelligence');

      const engine = new ContextIntelligenceEngine();

      // Register placeholder source adapters
      engine.registerSource({
        sourceType: 'engineering-graph',
        retrieve: async () => [],
      });

      const result = await engine.retrieveContext({
        query: `Changes in ${body.changedFiles?.join(', ') ?? 'unknown'}`,
        sourceTypes: ['engineering-graph', 'evidence'],
        tokenBudget: body.tokenBudget ?? 8000,
      });

      json(res, 200, {
        changeRef: body.changeRef,
        changedFiles: body.changedFiles ?? [],
        context: result,
        summary: `Retrieved ${result.results.length} context results for ${body.changedFiles?.length ?? 0} changed files`,
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  // ─── GET /api/context/stats ──────────────────────────────────
  if (method === 'GET' && p === '/api/context/stats') {
    json(res, 200, {
      status: 'operational',
      sourcesRegistered: ['diagnostics', 'evidence', 'engineering-graph'],
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  return false;
}
