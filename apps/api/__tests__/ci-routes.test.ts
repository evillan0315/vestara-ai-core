import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import {
  InMemoryCIDecisionStore,
  InMemoryCIObservationStore,
  InMemoryCIWebhookDeliveryStore,
} from '@vestara/ci-observer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildCIStatusReadModel,
  type CICorrelationWaitReadDto,
  collectCIRecords,
  decisionActionOf,
  handleCIRoute,
  webhookHealthFromDeliveries,
} from '../src/routes/ci.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

const WAIT: CICorrelationWaitReadDto = {
  taskId: 'task-1',
  taskSummary: 'Governed push',
  taskStatus: 'awaiting-verification',
  provider: 'github-actions',
  repository: 'vestara-ai-core',
  branch: 'vestara/task-1',
  commitSha: 'abc123',
  waitRef: 'ci-corr:vestara-ai-core:abc123:task-1',
  runRef: 'run-9',
  suspendedAt: '2026-09-16T00:00:00.000Z',
  deadline: { state: 'active', deadlineMs: 2_700_000, ageMs: 1_000, reason: 'Unresolved but within the deadline' },
};

function fakeContext(
  options: { projects?: Array<{ id: string }>; tasks?: Array<Record<string, unknown>> } = {},
): WorkspaceContext {
  const projects = options.projects ?? [{ id: 'project-1' }];
  return {
    runtime: { getSession: () => ({ fingerprint: { id: 'workspace-1' } }) },
    workflowOrchestrator: {
      listProjects: async () => projects,
      snapshot: async () => ({ tasks: options.tasks ?? [] }),
    },
  } as unknown as WorkspaceContext;
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & { headers: Record<string, string> };
  req.headers = {};
  queueMicrotask(() => req.emit('end'));
  return req;
}

const originalToken = process.env.GITHUB_TOKEN;
const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;

beforeEach(() => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

afterEach(() => {
  if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalToken;
  if (originalSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
  else process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
});

describe('buildCIStatusReadModel', () => {
  it('reports an unconfigured connection without claiming connectivity', () => {
    const model = buildCIStatusReadModel({
      credentialConfigured: false,
      webhookSecretConfigured: false,
      adapterVersion: '0.1.0',
      waits: [],
      correlationAvailability: 'available',
    });
    expect(model.connection.status).toBe('unconfigured');
    expect(model.connection.credentialConfigured).toBe(false);
    expect(model.connection.status).not.toBe('connected');
    expect(model.webhookHealth.state).toBe('unknown');
    expect(model.availability.connection).toBe('available');
  });

  it('reports configured (never connected) when a credential is present', () => {
    const model = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: true,
      adapterVersion: '0.1.0',
      waits: [WAIT],
      correlationAvailability: 'available',
    });
    expect(model.connection.status).toBe('configured');
    expect(model.connection.adapterVersion).toBe('0.1.0');
    expect(model.connection.repositories).toEqual(['vestara-ai-core']);
    expect(model.webhookHealth.state).toBe('configured');
  });

  it('holds observation and verification without fabricating green state', () => {
    const model = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: true,
      adapterVersion: '0.1.0',
      waits: [],
      correlationAvailability: 'available',
    });
    expect(model.observation.availability).toBe('unavailable');
    expect(model.verification.availability).toBe('unavailable');
    expect(model.availability.observation).toBe('unavailable');
    expect(model.availability.verification).toBe('unavailable');
  });

  it('parses persisted decision actions from the closed vocabulary only', () => {
    expect(decisionActionOf('obs-1:PROCEED_TO_VERIFICATION')).toBe('PROCEED_TO_VERIFICATION');
    expect(decisionActionOf('obs-1:HOLD')).toBe('HOLD');
    expect(decisionActionOf('obs-1:NOT_A_REAL_ACTION')).toBeUndefined();
    expect(decisionActionOf(undefined)).toBeUndefined();
  });

  it('counts stale waits without hiding them', () => {
    const stale = { ...WAIT, deadline: { ...WAIT.deadline, state: 'stale' as const, reason: 'Unresolved for 60m' } };
    const model = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: false,
      adapterVersion: '0.1.0',
      waits: [WAIT, stale],
      correlationAvailability: 'available',
    });
    expect(model.correlation.staleCount).toBe(1);
    expect(model.correlation.waits).toHaveLength(2);
  });

  it('carries correlation availability and reason through', () => {
    const model = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: false,
      adapterVersion: '0.1.0',
      waits: [],
      correlationAvailability: 'unavailable',
      correlationReason: 'orchestration offline',
    });
    expect(model.correlation.availability).toBe('unavailable');
    expect(model.correlation.reason).toBe('orchestration offline');
    expect(model.availability.correlation).toBe('unavailable');
  });
});

describe('handleCIRoute', () => {
  it('serves the provider-neutral status model without secrets', async () => {
    process.env.GITHUB_TOKEN = 'ghp_supersecret_value';
    process.env.GITHUB_WEBHOOK_SECRET = 'whsec_supersecret_value';
    const { res, body, status } = fakeResponse();
    const handled = await handleCIRoute('GET', '/api/ci/status', fakeRequest(), res, fakeContext());
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const model = body() as ReturnType<typeof buildCIStatusReadModel>;
    expect(model.connection.credentialConfigured).toBe(true);
    expect(model.connection.status).toBe('configured');
    expect(model.provider).toBe('github-actions');
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('ghp_supersecret_value');
    expect(serialized).not.toContain('whsec_supersecret_value');
    // Only safe metadata keys; never a credential/token/secret field.
    expect(serialized).not.toMatch(/"(?:token|secret|authorization|installationToken)"\s*:/i);
    expect(model.connection.credentialConfigured).toBe(true);
  });

  it('projects authoritative waits from orchestrated tasks', async () => {
    const { res, body, status } = fakeResponse();
    await handleCIRoute(
      'GET',
      '/api/ci/status',
      fakeRequest(),
      res,
      fakeContext({
        tasks: [
          {
            id: 'task-1',
            summary: 'Governed push',
            status: 'awaiting-verification',
            externalWait: {
              waitRef: 'ci-corr:repo:abc:task-1',
              provider: 'github-actions',
              runRef: 'run-9',
              repository: 'repo',
              commitSha: 'abc',
              branch: 'vestara/task-1',
              suspendedAt: '2026-09-16T00:00:00.000Z',
              decisionRef: 'obs-1:PROCEED_TO_VERIFICATION',
            },
          },
        ],
      }),
    );
    expect(status()).toBe(200);
    const model = body() as ReturnType<typeof buildCIStatusReadModel>;
    expect(model.correlation.waits).toHaveLength(1);
    expect(model.correlation.waits[0]?.decisionAction).toBe('PROCEED_TO_VERIFICATION');
    expect(model.connection.repositories).toEqual(['repo']);
  });

  it('reports correlation unavailable when the orchestration read fails', async () => {
    const { res, body } = fakeResponse();
    const ctx = {
      runtime: { getSession: () => ({ fingerprint: { id: 'w' } }) },
      workflowOrchestrator: {
        listProjects: async () => {
          throw new Error('orchestration offline');
        },
      },
    } as unknown as WorkspaceContext;
    await handleCIRoute('GET', '/api/ci/status', fakeRequest(), res, ctx);
    const model = body() as ReturnType<typeof buildCIStatusReadModel>;
    expect(model.correlation.availability).toBe('unavailable');
    expect(model.correlation.reason).toBe('orchestration offline');
  });

  it('returns 404 for unknown CI routes and ignores other prefixes', async () => {
    const notFound = fakeResponse();
    expect(await handleCIRoute('GET', '/api/ci/unknown', fakeRequest(), notFound.res, fakeContext())).toBe(true);
    expect(notFound.status()).toBe(404);

    const other = fakeResponse();
    expect(await handleCIRoute('GET', '/api/other', fakeRequest(), other.res, fakeContext())).toBe(false);
  });
});

describe('CI persisted records (CI-OBS-001E)', () => {
  it('derives webhook health from observed deliveries, never from absence', () => {
    expect(webhookHealthFromDeliveries([])).toBeUndefined();
    expect(
      webhookHealthFromDeliveries([
        { deliveryId: 'd1', kind: 'completion', accepted: true, receivedAt: '2026-09-16T00:00:00.000Z' },
      ])?.state,
    ).toBe('receiving');
    expect(
      webhookHealthFromDeliveries([
        {
          deliveryId: 'd2',
          kind: 'unknown',
          accepted: false,
          reason: 'invalid-signature',
          receivedAt: '2026-09-16T01:00:00.000Z',
        },
      ])?.state,
    ).toBe('error');
    expect(
      webhookHealthFromDeliveries([
        {
          deliveryId: 'd3',
          kind: 'push',
          accepted: false,
          reason: 'unsupported-event',
          receivedAt: '2026-09-16T02:00:00.000Z',
        },
      ])?.state,
    ).toBe('configured');
  });

  it('maps persisted observation and decision into the read model', async () => {
    const observations = new InMemoryCIObservationStore();
    const decisions = new InMemoryCIDecisionStore();
    const deliveries = new InMemoryCIWebhookDeliveryStore();
    await observations.save({
      observationId: 'obs-9',
      runId: 'run-9',
      commitSha: 'abc',
      status: 'completed',
      conclusion: 'passed',
      passedChecks: 3,
      failedChecks: 0,
      skippedChecks: 0,
      trigger: 'webhook',
      observedAt: '2026-09-16T03:00:00.000Z',
    });
    await decisions.save({
      decisionId: 'obs-9:review',
      observationId: 'obs-9',
      classification: 'UNKNOWN',
      verdict: 'hold',
      action: 'PROCEED_TO_VERIFICATION',
      confidence: 'low',
      decisionRef: 'obs-9:PROCEED_TO_VERIFICATION',
      decidedAt: '2026-09-16T03:00:00.000Z',
    });
    await deliveries.record({
      deliveryId: 'd-9',
      kind: 'completion',
      accepted: true,
      receivedAt: '2026-09-16T03:00:00.000Z',
    });
    const ctx = { ciRecords: { observations, decisions, deliveries } } as unknown as WorkspaceContext;
    const records = await collectCIRecords(ctx);
    expect(records.observation?.availability).toBe('available');
    expect(records.observation?.runId).toBe('run-9');
    expect(records.verification?.action).toBe('PROCEED_TO_VERIFICATION');
    expect(records.webhookHealth?.state).toBe('receiving');

    const model = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: true,
      adapterVersion: '0.1.0',
      waits: [],
      correlationAvailability: 'available',
      ...records,
    });
    expect(model.observation.availability).toBe('available');
    expect(model.observation.conclusion).toBe('passed');
    expect(model.verification.availability).toBe('available');
    expect(model.webhookHealth.state).toBe('receiving');
  });
});

describe('CI connectivity verification', () => {
  it('reports connected only after a verified probe', () => {
    const powered = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: false,
      adapterVersion: '0.1.0',
      waits: [],
      correlationAvailability: 'available',
    });
    expect(powered.connection.status).toBe('configured');

    const verified = buildCIStatusReadModel({
      credentialConfigured: true,
      webhookSecretConfigured: false,
      adapterVersion: '0.1.0',
      waits: [],
      correlationAvailability: 'available',
      connectivity: { state: 'connected', checkedAt: '2026-09-16T00:00:00.000Z', repository: 'a/b' },
    });
    expect(verified.connection.status).toBe('connected');
    expect(verified.connection.connectivity?.repository).toBe('a/b');
  });

  it('rejects a connectivity probe when no repository can be resolved', async () => {
    const { res, status } = fakeResponse();
    const ctx = fakeContext();
    const handled = await handleCIRoute('POST', '/api/ci/connection/test', fakeRequest(), res, ctx);
    expect(handled).toBe(true);
    expect(status()).toBe(400);
  });
});
