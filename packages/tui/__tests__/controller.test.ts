import { describe, expect, it } from 'vitest';
import { snapshotFromEvents, splitArguments } from '../src/controller.js';

describe('TUI controller helpers', () => {
  it('parses quoted slash command arguments', () => {
    expect(splitArguments('agent developer "strict engineering"')).toEqual([
      'agent',
      'developer',
      'strict engineering',
    ]);
  });

  it('reduces runtime events into a startup snapshot', () => {
    const snapshot = snapshotFromEvents([
      { type: 'workspace', workspace: { id: 'workspace-1', name: 'Vestara', branch: 'main' } },
      { type: 'agent', agent: { id: 'developer', name: 'Developer', status: 'working' } },
      { type: 'agent', agent: { id: 'developer', name: 'Developer', status: 'completed' } },
      { type: 'graph', entities: [{ id: 'task://1', kind: 'task', label: 'Build TUI' }] },
    ]);
    expect(snapshot.workspace?.branch).toBe('main');
    expect(snapshot.agents).toEqual([{ id: 'developer', name: 'Developer', status: 'completed' }]);
    expect(snapshot.graphEntities[0]?.id).toBe('task://1');
  });
});
