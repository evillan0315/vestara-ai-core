import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from '../src/index';

describe('MetricsRegistry contract', () => {
  it('counts, gauges, histograms, and exports Prometheus text', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('jobs_total', 2);
    metrics.increment('jobs_total');
    metrics.gauge('queue_depth', 4);
    metrics.record('job_duration_ms', 120);
    const snapshot = metrics.snapshot();
    expect(snapshot.counters.jobs_total).toBe(3);
    expect(snapshot.gauges.queue_depth).toBe(4);
    expect(snapshot.histograms.job_duration_ms.count).toBe(1);
    expect(metrics.exportPrometheus()).toContain('jobs_total');
  });

  it('scopes child registries with inherited labels', () => {
    const parent = new MetricsRegistry({ labels: { service: 'api' } });
    const child = parent.child({ route: '/health' });
    child.increment('requests_total');
    expect(child.snapshot().counters['requests_total{service="api",route="/health"}']).toBe(1);
    expect(parent.snapshot().counters.requests_total).toBeUndefined();
  });
});
