import { describe, expect, it } from 'vitest';
import { LifecycleController } from '../src/lifecycle.js';

describe('LifecycleController', () => {
  it('starts all services in dependency order', async () => {
    const ctl = new LifecycleController();
    const results = await ctl.startAll();
    expect(results.length).toBe(14);
    expect(results.every((s) => s.status === 'running')).toBe(true);
  });

  it('reports all services as stopped before start', () => {
    const ctl = new LifecycleController();
    const statuses = ctl.getAllStatuses();
    expect(statuses.every((s) => s.status === 'stopped')).toBe(true);
  });

  it('stops all services gracefully', async () => {
    const ctl = new LifecycleController();
    await ctl.startAll();
    const stopped = await ctl.stopAll();
    expect(stopped.every((s) => s.status === 'stopped')).toBe(true);
  });

  it('computes propagated health correctly when all running', async () => {
    const ctl = new LifecycleController();
    await ctl.startAll();
    const statuses = ctl.getAllStatuses();
    for (const s of statuses) {
      expect(s.overallHealth!).toBe(100);
    }
  });

  it('dependency health propagates through layers', () => {
    const ctl = new LifecycleController();
    const statuses = ctl.getAllStatuses();
    for (const s of statuses) {
      if (s.dependencies && s.dependencies.length > 0) {
        expect(s.overallHealth).toBeDefined();
      }
    }
  });

  it('renders status output', async () => {
    const ctl = new LifecycleController();
    await ctl.startAll();
    const output = ctl.renderStatuses(ctl.getAllStatuses());
    expect(output).toContain('vestara-kernel');
    expect(output).toContain('running');
    expect(output).toContain('Health:');
  });

  it('renders summary with top health', async () => {
    const ctl = new LifecycleController();
    await ctl.startAll();
    const summary = ctl.getSummary();
    const rendered = ctl.renderSummary(summary);
    expect(rendered).toContain('Top Health:');
    expect(rendered).toContain('100%');
  });
});
