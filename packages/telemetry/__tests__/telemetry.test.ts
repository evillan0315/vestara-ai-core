import { describe, expect, it } from 'vitest';
import { TelemetryRuntime } from '../src/index.js';

describe('TelemetryRuntime', () => {
  it('creates 5 default agents', () => {
    const rt = new TelemetryRuntime();
    const agents = rt.getAllAgents();
    expect(agents).toHaveLength(5);
    expect(agents.map((a) => a.name)).toContain('Context');
    expect(agents.map((a) => a.name)).toContain('Planner');
    expect(agents.map((a) => a.name)).toContain('Engineer');
    expect(agents.map((a) => a.name)).toContain('Reviewer');
    expect(agents.map((a) => a.name)).toContain('Verifier');
  });

  it('default agents start idle', () => {
    const rt = new TelemetryRuntime();
    for (const agent of rt.getAllAgents()) {
      expect(agent.status).toBe('idle');
    }
  });

  it('trackOp updates agent state', () => {
    const rt = new TelemetryRuntime();
    rt.trackOp('engineer', 'working', 'file.read', 'Reading types.ts', {
      filePath: 'src/types.ts',
      progress: 50,
      detail: 'Parsing exports',
    });

    const agent = rt.getAgent('engineer');
    expect(agent).toBeDefined();
    expect(agent!.status).toBe('working');
    expect(agent!.currentOperation).toBe('file.read');
    expect(agent!.activeFilePath).toBe('src/types.ts');
    expect(agent!.progress).toBe(50);
    expect(agent!.detail).toBe('Parsing exports');
  });

  it('trackOp stores events', () => {
    const rt = new TelemetryRuntime();
    rt.trackOp('engineer', 'working', 'file.write', 'Writing code', { progress: 30 });
    rt.trackOp('verifier', 'verifying', 'verify', 'Running tests', { progress: 60 });
    rt.trackOp('planner', 'completed', 'plan', 'Planning done', { progress: 100 });

    const events = rt.getEvents(10);
    expect(events).toHaveLength(3);
    expect(events[0].agent).toBe('engineer');
    expect(events[1].agent).toBe('verifier');
    expect(events[2].agent).toBe('planner');
  });

  it('setStatus and setTask update agent state directly', () => {
    const rt = new TelemetryRuntime();
    rt.setStatus('planner', 'thinking', 'Analyzing dependencies');
    rt.setTask('planner', 'Design EV-004');

    const agent = rt.getAgent('planner');
    expect(agent!.status).toBe('thinking');
    expect(agent!.detail).toBe('Analyzing dependencies');
    expect(agent!.currentTask).toBe('Design EV-004');
  });

  it('setProgress updates progress without creating events', () => {
    const rt = new TelemetryRuntime();
    rt.setProgress('engineer', 75, 'Almost done');
    const agent = rt.getAgent('engineer');
    expect(agent!.progress).toBe(75);
    expect(agent!.detail).toBe('Almost done');
    expect(rt.getEvents()).toHaveLength(0);
  });

  it('subscribe receives events', () => {
    const rt = new TelemetryRuntime();
    const received: string[] = [];
    const unsub = rt.subscribe((ev) => received.push(ev.agent));

    rt.trackOp('engineer', 'working', 'file.write', 'test', {});
    rt.trackOp('planner', 'completed', 'plan', 'test', {});

    expect(received).toHaveLength(2);
    expect(received).toContain('engineer');
    expect(received).toContain('planner');

    unsub();
    rt.trackOp('verifier', 'verifying', 'verify', 'test', {});
    expect(received).toHaveLength(2);
  });

  it('snapshot captures current state', () => {
    const rt = new TelemetryRuntime();
    rt.trackOp('engineer', 'working', 'file.write', 'Writing', { progress: 50 });

    const snap = rt.snapshot();
    expect(snap.agents).toHaveLength(5);
    expect(snap.events).toHaveLength(1);
    expect(snap.eventCount).toBe(1);
    expect(snap.startedAt).toBeDefined();
  });

  it('addAgent and removeAgent work', () => {
    const rt = new TelemetryRuntime();
    rt.addAgent('custom', 'Custom Agent');
    expect(rt.getAllAgents()).toHaveLength(6);
    expect(rt.getAgent('custom')?.name).toBe('Custom Agent');

    rt.removeAgent('custom');
    expect(rt.getAllAgents()).toHaveLength(5);
  });

  it('reset clears all state', () => {
    const rt = new TelemetryRuntime();
    rt.trackOp('engineer', 'working', 'file.write', 'test', { progress: 50 });
    rt.addAgent('custom', 'Custom');
    expect(rt.getEventCount()).toBe(1);
    expect(rt.getAllAgents()).toHaveLength(6);

    rt.reset();
    expect(rt.getEventCount()).toBe(0);
    expect(rt.getEvents()).toHaveLength(0);
    expect(rt.getAllAgents()).toHaveLength(5);
    for (const a of rt.getAllAgents()) {
      expect(a.status).toBe('idle');
    }
  });
});
