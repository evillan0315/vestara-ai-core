import { describe, expect, it } from 'vitest';
import { computeWaves, detectCycles, readyTasks } from '../src/task-graph';

describe('task graph scheduling (PCS-025 §12)', () => {
  it('orders dependent tasks into waves', () => {
    const tasks = [
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [] },
      { id: 'c', dependencies: ['a', 'b'] },
      { id: 'd', dependencies: ['c'] },
    ];
    const waves = computeWaves(tasks);
    expect(waves[0].sort()).toEqual(['a', 'b']);
    expect(waves[1]).toEqual(['c']);
    expect(waves[2]).toEqual(['d']);
  });

  it('puts cycles into the final wave instead of hanging', () => {
    const tasks = [
      { id: 'a', dependencies: ['b'] },
      { id: 'b', dependencies: ['a'] },
    ];
    const waves = computeWaves(tasks);
    expect(waves.at(-1)?.sort()).toEqual(['a', 'b']);
  });

  it('detects dependency cycles', () => {
    const cycles = detectCycles([
      { id: 'a', dependencies: ['b'] },
      { id: 'b', dependencies: ['c'] },
      { id: 'c', dependencies: ['a'] },
    ]);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('a');
  });

  it('returns only tasks whose dependencies are complete', () => {
    const tasks = [
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: ['a'] },
      { id: 'c', dependencies: ['missing'] },
    ];
    const ready = readyTasks(tasks, new Set(['a']));
    expect(ready.map((task) => task.id).sort()).toEqual(['a', 'b']);
  });
});
