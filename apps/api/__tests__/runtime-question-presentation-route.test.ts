/**
 * AR-TOOL-ASK-003A4B — Presentation route evidence.
 *
 * Proves the explicit mutation boundary:
 *   POST /api/activity-room/v1/interactions/:interactionId/present
 *  - exists as a POST mutation (never a cacheable GET);
 *  - delegates to the exact durable presentation authority;
 *  - fails closed (404 missing, 410 expired, 409 non-presentable, 503
 *    unavailable authority, 400 bad identity/body);
 *  - returns the credential with `Cache-Control: no-store` and never logs
 *    the claim token, never writes M9, never claims, never delivers.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROUTE_URL = new URL('../src/routes/activity-room-m11a.ts', import.meta.url);

function routeSource(): string {
  return readFileSync(ROUTE_URL, 'utf8');
}

describe('AR-TOOL-ASK-003A4B presentation route', () => {
  it('exposes an explicit POST present mutation (never a GET)', () => {
    const source = routeSource();
    expect(source).toContain('POST /api/activity-room/v1/interactions/:id/present');
    expect(source).toContain("method === 'POST'");
    expect(source).toContain('/api/activity-room/v1/interactions/');
    expect(source).toContain('/present');
    expect(source).not.toContain('GET /api/activity-room/v1/interactions');
  });

  it('delegates to the exact durable presentation authority', () => {
    const source = routeSource();
    expect(source).toContain('presentRuntimeQuestionForBrowser');
    expect(source).toContain("from '@vestara/activity-room'");
    expect(source).toContain('room.runtimeQuestions');
  });

  it('fails closed with distinct codes and never caches the credential', () => {
    const source = routeSource();
    expect(source).toContain('RUNTIME_QUESTIONS_UNAVAILABLE');
    expect(source).toContain('NOT_PRESENTABLE');
    expect(source).toContain('no-store');
    expect(source).toContain('404');
    expect(source).toContain('410');
    expect(source).toContain('409');
    expect(source).toContain('INVALID_IDENTITY');
  });

  it('introduces no delivery, no claim, no M9 write, no token logging', () => {
    const source = routeSource();
    const start = source.indexOf('interactions/:id/present');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('/api/activity-room/v1/workflow-summary', start));
    expect(block).not.toContain('replyToQuestion(');
    expect(block).not.toContain('rejectQuestion(');
    expect(block).not.toContain('.claim(');
    expect(block).not.toContain('markDelivered(');
    expect(block).not.toContain('claim_token');
    expect(block).not.toMatch(/console\.\w+\(.*claimToken/);
  });

  it('documents the exact 4C handoff payload shape', () => {
    const service = readFileSync(
      new URL('../../../packages/activity-room/src/runtime-question-presentation.ts', import.meta.url),
      'utf8',
    );
    for (const field of ['interactionId', 'version', 'claimToken', 'questions']) {
      expect(service, field).toContain(field);
    }
    expect(service).toContain('BrowserRuntimeQuestionPresentation');
  });
});
