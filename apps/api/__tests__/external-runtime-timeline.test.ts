import type { ExternalSessionDetails, ExternalSessionRuntimeSnapshot } from '@vestara/external-runtime';
import { describe, expect, it } from 'vitest';
import { buildSessionTimeline, diffEffective, snapshotHash } from '../src/external-runtime/service.js';

function sessionFixture(overrides: Partial<ExternalSessionDetails> = {}): ExternalSessionDetails {
  return {
    id: 'session-1',
    runtimeInstanceId: 'opencode-inst-1',
    runtimeType: 'opencode',
    externalSessionId: 'oc-1',
    title: 'Fix build',
    status: 'running',
    integrationLevel: 'live-observation',
    startedAt: '2026-08-02T10:00:00.000Z',
    lastActivityAt: '2026-08-02T10:05:00.000Z',
    messages: [],
    tools: [],
    commands: [],
    fileMutations: [],
    diff: undefined,
    permissions: [],
    diagnostics: [],
    todos: [],
    partiallyObserved: false,
    filesChanged: 1,
    toolCount: 0,
    commandCount: 0,
    ...overrides,
  };
}

function snapshotFixture(overrides: Partial<ExternalSessionRuntimeSnapshot> = {}): ExternalSessionRuntimeSnapshot {
  return {
    id: 'snap-1',
    sessionId: 'oc-1',
    runtimeInstanceId: 'opencode-inst-1',
    runtimeType: 'opencode',
    runtimeVersion: '1.18.8',
    agentId: 'build',
    providerId: 'openai',
    modelId: 'openai/model-a',
    availableSkillIds: ['testing', 'review'],
    loadedSkillIds: ['testing'],
    advertisedSkillIds: [],
    effectiveConfigurationHash: 'abc123',
    observedAt: '2026-08-02T10:01:00.000Z',
    provenance: 'runtime-reported',
    ...overrides,
  };
}

describe('buildSessionTimeline', () => {
  it('produces a sorted, source-tagged sequence from session detail + snapshot', () => {
    const session = sessionFixture({
      fileMutations: [
        {
          id: 'm1',
          sessionId: 'oc-1',
          filePath: '/repo/src/a.ts',
          mutation: 'modified',
          ingestedAt: '2026-08-02T10:02:00.000Z',
        },
      ],
      commands: [
        {
          id: 'c1',
          sessionId: 'oc-1',
          command: 'pnpm test',
          status: 'completed',
          exitCode: 0,
          ingestedAt: '2026-08-02T10:03:00.000Z',
        },
      ],
    });
    const { items, sources } = buildSessionTimeline(session, snapshotFixture(), []);

    expect(sources.eventStore).toBe(0);
    expect(sources.sessionDetail).toBe(2);
    expect(sources.snapshot).toBe(1);
    expect(items.length).toBeGreaterThanOrEqual(5);

    const kinds = items.map((item) => item.kind);
    expect(kinds).toContain('session-started');
    expect(kinds).toContain('file-modified');
    expect(kinds).toContain('command-executed');
    expect(kinds).toContain('snapshot-captured');
    expect(kinds).toContain('agent-selected');
    expect(kinds).toContain('skill-loaded');

    const times = items.map((item) => item.at);
    expect([...times].sort()).toEqual(times);

    const fileItem = items.find((item) => item.kind === 'file-modified')!;
    expect(fileItem.observationLevel).toBe('observed');
    expect(fileItem.promoted).toBe(true);
    expect(fileItem.entityIds).toContain('filesystem://repo/src/a.ts');

    const snapshotItem = items.find((item) => item.kind === 'snapshot-captured')!;
    expect(snapshotItem.observationLevel).toBe('observed');
    const skillItem = items.find((item) => item.kind === 'skill-loaded')!;
    expect(skillItem.entityIds).toContain('skill://external/opencode-inst-1/testing');
  });

  it('flags inferred snapshot data as inferred when not runtime-reported', () => {
    const { items } = buildSessionTimeline(sessionFixture(), snapshotFixture({ provenance: 'partially-inferred' }), []);
    const agentItem = items.find((item) => item.kind === 'agent-selected')!;
    expect(agentItem.observationLevel).toBe('inferred');
    expect(items.find((item) => item.kind === 'snapshot-captured')!.observationLevel).toBe('inferred');
  });

  it('maps persisted event-store events and dedupes by correlation id', () => {
    const stored = [
      {
        type: 'external-runtime.command',
        at: '2026-08-02T10:02:00.000Z',
        correlationId: 'corr-1',
        payload: {
          runtimeType: 'opencode',
          runtimeInstanceId: 'opencode-inst-1',
          observationLevel: 'observed',
          command: 'ls',
        },
      },
      {
        type: 'external-runtime.command',
        at: '2026-08-02T10:02:00.000Z',
        correlationId: 'corr-1',
        payload: {
          runtimeType: 'opencode',
          runtimeInstanceId: 'opencode-inst-1',
          observationLevel: 'observed',
          command: 'ls',
        },
      },
      {
        type: 'external-runtime.file-mutation',
        at: '2026-08-02T10:04:00.000Z',
        correlationId: 'corr-2',
        payload: {
          runtimeType: 'opencode',
          runtimeInstanceId: 'opencode-inst-1',
          observationLevel: 'observed',
          filePath: '/repo/src/b.ts',
          mutation: 'created',
        },
      },
    ];
    const { items, sources } = buildSessionTimeline(null, null, stored);
    expect(sources.eventStore).toBe(3);
    const commandItems = items.filter((item) => item.kind === 'command-executed');
    expect(commandItems).toHaveLength(1);
    const fileItem = items.find((item) => item.kind === 'file-modified')!;
    expect(fileItem.source).toBe('event-store');
    expect(fileItem.promoted).toBe(true);
  });

  it('handles a terminal session by emitting session-finished', () => {
    const { items } = buildSessionTimeline(sessionFixture({ status: 'completed' }), null, []);
    expect(items.find((item) => item.kind === 'session-finished')).toBeDefined();
  });

  it('never throws on missing data', () => {
    expect(() => buildSessionTimeline(null, null, [])).not.toThrow();
    const { items } = buildSessionTimeline(null, null, []);
    expect(items).toEqual([]);
  });
});

describe('configuration drift helpers', () => {
  const snapshot = (effective: Record<string, unknown>) =>
    ({
      id: 's',
      runtimeInstanceId: 'r1',
      runtimeType: 'opencode',
      sources: [],
      effective,
      capturedAt: '2026-08-02T10:00:00.000Z',
    }) as Parameters<typeof snapshotHash>[0];

  it('detects hash differences for changed effective config', () => {
    expect(snapshotHash(snapshot({ agent: 'build' }))).not.toBe(snapshotHash(snapshot({ agent: 'build-x' })));
    expect(snapshotHash(snapshot({ agent: 'build' }))).toBe(snapshotHash(snapshot({ agent: 'build' })));
  });

  it('produces human-readable field diffs for scalar changes', () => {
    const changes = diffEffective(
      snapshot({ agent: 'build', model: 'a' }).effective,
      snapshot({ agent: 'build', model: 'b' }).effective,
      String,
    );
    expect(changes).toContainEqual({ path: 'model', previous: 'a', current: 'b', change: 'updated' });
  });

  it('reports added and removed array entries by label', () => {
    const changes = diffEffective(
      {
        agents: [
          { name: 'build', model: 'a' },
          { name: 'review', model: 'b' },
        ],
      },
      {
        agents: [
          { name: 'build', model: 'a' },
          { name: 'fix', model: 'c' },
        ],
      },
      (value) => (value as { name: string }).name,
    );
    expect(changes).toContainEqual({
      path: 'agents.review',
      previous: { name: 'review', model: 'b' },
      current: undefined,
      change: 'removed',
    });
    expect(changes).toContainEqual({
      path: 'agents.fix',
      previous: undefined,
      current: { name: 'fix', model: 'c' },
      change: 'added',
    });
  });
});
