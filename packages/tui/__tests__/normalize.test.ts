import { describe, expect, it } from 'vitest';
import { humanizeTool, normalizeRuntimeEvent } from '../src/normalize.js';

describe('TUI runtime event normalization', () => {
  it('converts tool protocol into a human-readable execution card', () => {
    const result = normalizeRuntimeEvent({
      id: 'event-1',
      type: 'tool.call.started',
      timestamp: '2026-08-01T00:00:00.000Z',
      payload: {
        callId: 'call-1',
        toolName: 'filesystem.read',
        filePath: 'README.md',
        arguments: { path: 'README.md', secret: 'never-render' },
        providerMetadata: '<tool_call>raw</tool_call>',
      },
    });
    expect(result).toEqual([
      {
        type: 'tool',
        card: {
          id: 'call-1',
          tool: 'filesystem.read',
          label: 'Reading README.md',
          status: 'running',
          startedAt: '2026-08-01T00:00:00.000Z',
        },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('never-render');
    expect(JSON.stringify(result)).not.toContain('tool_call');
  });

  it('normalizes agent and completion events without provider payloads', () => {
    expect(
      normalizeRuntimeEvent({
        type: 'agent.turn.started',
        payload: { agentId: 'developer', task: 'Build sidebar', progress: 20, raw: '<dsml>' },
      })[0],
    ).toMatchObject({ type: 'agent', agent: { id: 'developer', task: 'Build sidebar', progress: 20 } });
    expect(normalizeRuntimeEvent({ type: 'verification.completed', message: 'Build succeeded' })[0]).toEqual({
      type: 'notification',
      level: 'success',
      message: 'Build succeeded',
    });
  });

  it('humanizes common tool operations', () => {
    expect(humanizeTool('shell.build')).toBe('Running build');
    expect(humanizeTool('filesystem.search')).toBe('Searching workspace');
  });
});
