import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../src/pages/activity/activity-types';
import { collapseToolRuns, hierarchyCategory, matchesDensity } from '../src/pages/activity/activity-formatters';

function agentMessage(overrides: Partial<ActivityRecord> & { id: string; sequence: number }): ActivityRecord {
  return {
    id: overrides.id,
    sequence: overrides.sequence,
    timestamp: '2026-08-06T12:00:00.000Z',
    actor: { type: 'agent', id: 'vestara-developer', displayName: 'Developer' },
    kind: 'agent-message',
    agentId: 'vestara-developer',
    messageKind: 'message',
    content: 'message',
    evidenceRefs: [],
    ...overrides,
  };
}

describe('hierarchyCategory', () => {
  it('classifies tool calls and chat into separate categories', () => {
    expect(hierarchyCategory(agentMessage({ id: 'a', sequence: 1, messageKind: 'tool-call', toolName: 'filesystem.read' }))).toBe('TOOL');
    expect(hierarchyCategory(agentMessage({ id: 'b', sequence: 2, content: 'hello' }))).toBe('AGENT');
  });
});

describe('matchesDensity', () => {
  it('raw shows everything; operational/summary hide tool chatter', () => {
    const tool = agentMessage({ id: 'a', sequence: 1, messageKind: 'tool-call', toolName: 'filesystem.read' });
    expect(matchesDensity(tool, 'raw')).toBe(true);
    expect(matchesDensity(tool, 'operational')).toBe(false);
    expect(matchesDensity(tool, 'summary')).toBe(false);
  });
});

describe('collapseToolRuns (aggregation)', () => {
  it('collapses a run of tool events into one operational row', () => {
    const records = [
      agentMessage({ id: 't1', sequence: 1, messageKind: 'tool-call', toolName: 'filesystem.read' }),
      agentMessage({ id: 't2', sequence: 2, messageKind: 'tool-call', toolName: 'filesystem.read' }),
      agentMessage({ id: 't3', sequence: 3, messageKind: 'tool-call', toolName: 'filesystem.update' }),
    ];
    const collapsed = collapseToolRuns(records);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].kind).toBe('tools');
    if (collapsed[0].kind === 'tools') {
      expect(collapsed[0].count).toBe(3);
      expect(collapsed[0].lastTool).toBe('filesystem.update');
    }
  });

  it('does not merge across a non-tool boundary', () => {
    const records = [
      agentMessage({ id: 't1', sequence: 1, messageKind: 'tool-call', toolName: 'filesystem.read' }),
      agentMessage({ id: 'm1', sequence: 2, content: 'thinking' }),
      agentMessage({ id: 't2', sequence: 3, messageKind: 'tool-call', toolName: 'filesystem.update' }),
    ];
    const collapsed = collapseToolRuns(records);
    expect(collapsed.filter((entry) => entry.kind === 'tools')).toHaveLength(2);
    expect(collapsed.filter((entry) => entry.kind === 'record')).toHaveLength(1);
  });

  it('bounds a 10k tool-run into a single aggregated row', () => {
    const records = Array.from({ length: 10_000 }, (_, i) =>
      agentMessage({ id: `t${i}`, sequence: i + 1, messageKind: 'tool-call', toolName: 'filesystem.read' }),
    );
    const collapsed = collapseToolRuns(records);
    expect(collapsed).toHaveLength(1);
    if (collapsed[0].kind === 'tools') expect(collapsed[0].count).toBe(10_000);
  });
});
