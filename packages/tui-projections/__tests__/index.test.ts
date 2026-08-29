import { describe, expect, it } from 'vitest';
import { projectTask } from '../src/index.js';

describe('TUI projections', () => {
  it('projects durable thread truth', () => {
    const result = projectTask({
      replay: {
        thread: {
          id: 't' as any,
          taskId: 'T',
          title: 'Task',
          status: 'active',
          environmentId: 'e' as any,
          createdAt: 'x',
          updatedAt: 'x',
          metadata: {},
        },
        turns: [],
        items: [],
      },
      events: [],
    });
    expect(result.thread.title).toBe('Task');
    expect(result.sequence).toBe(0);
  });
});
