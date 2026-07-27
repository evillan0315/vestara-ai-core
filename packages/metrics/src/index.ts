/**
 * @vestara/metrics — Metrics Collector
 *
 * Counters, gauges, histograms with Prometheus export format.
 * Every service emits metrics by default.
 *
 * Architecture Traceability:
 *   Runtime: METRICS-ARCHITECTURE.md
 *   Foundation: UNIVERSAL-INTERFACE.md → MetricsCollector
 */

import type { Logger } from '@vestara/logger';
import type { HistogramSummary, MetricSnapshot } from '@vestara/shared';

interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  help: string;
}

interface CounterMetric extends Metric {
  type: 'counter';
  value: number;
}

interface GaugeMetric extends Metric {
  type: 'gauge';
  value: number;
}

interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: number[];
  counts: Map<number, number>;
  sum: number;
  values: number[];
}

type MetricStore = CounterMetric | GaugeMetric | HistogramMetric;

export interface MetricsCollector {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  record(name: string, value: number, tags?: Record<string, string>): void;
  time<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T>;
  snapshot(): MetricSnapshot;
  exportPrometheus(): string;
}

export class MetricsRegistry implements MetricsCollector {
  private metrics: Map<string, MetricStore> = new Map();
  private labels: Record<string, string> = {};
  private logger?: Logger;

  constructor(options?: { logger?: Logger; labels?: Record<string, string> }) {
    this.logger = options?.logger;
    this.labels = options?.labels ?? {};
  }

  child(tags: Record<string, string>): MetricsCollector {
    return new MetricsRegistry({
      logger: this.logger,
      labels: { ...this.labels, ...tags },
    });
  }

  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const key = this.key(name, tags);
    let metric = this.metrics.get(key);
    if (metric?.type !== 'counter') {
      metric = { name, type: 'counter', help: name, value: 0 };
      this.metrics.set(key, metric);
    }
    (metric as CounterMetric).value += value;
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.key(name, tags);
    let metric = this.metrics.get(key);
    if (metric?.type !== 'gauge') {
      metric = { name, type: 'gauge', help: name, value: 0 };
      this.metrics.set(key, metric);
    }
    (metric as GaugeMetric).value = value;
  }

  record(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.key(name, tags);
    let metric = this.metrics.get(key);
    if (metric?.type !== 'histogram') {
      metric = {
        name,
        type: 'histogram',
        help: name,
        buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
        counts: new Map(),
        sum: 0,
        values: [],
      };
      this.metrics.set(key, metric);
    }
    const h = metric as HistogramMetric;
    h.values.push(value);
    h.sum += value;

    // Find bucket
    for (const bucket of h.buckets) {
      if (value <= bucket) {
        h.counts.set(bucket, (h.counts.get(bucket) ?? 0) + 1);
        break;
      }
    }
  }

  async time<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.record(name, duration, tags);
    }
  }

  snapshot(): MetricSnapshot {
    const now = new Date().toISOString();
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const histograms: Record<string, HistogramSummary> = {};

    for (const [key, metric] of this.metrics) {
      switch (metric.type) {
        case 'counter':
          counters[key] = (metric as CounterMetric).value;
          break;
        case 'gauge':
          gauges[key] = (metric as GaugeMetric).value;
          break;
        case 'histogram': {
          const h = metric as HistogramMetric;
          const sorted = [...h.values].sort((a, b) => a - b);
          histograms[key] = {
            count: h.values.length,
            sum: h.sum,
            min: sorted[0] ?? 0,
            max: sorted[sorted.length - 1] ?? 0,
            p50: percentile(sorted, 50),
            p95: percentile(sorted, 95),
            p99: percentile(sorted, 99),
          };
          break;
        }
      }
    }

    return { timestamp: now, counters, gauges, histograms };
  }

  exportPrometheus(): string {
    const lines: string[] = [];
    const snapshot = this.snapshot();

    for (const [name, value] of Object.entries(snapshot.counters)) {
      lines.push(`# HELP ${name} ${name}`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, value] of Object.entries(snapshot.gauges)) {
      lines.push(`# HELP ${name} ${name}`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }

    const histograms: Record<string, HistogramSummary> = snapshot.histograms;
    for (const [name, h] of Object.entries(histograms)) {
      lines.push(`# HELP ${name} ${name}`);
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count ${h.count}`);
      lines.push(`${name}_sum ${h.sum}`);
    }

    return lines.join('\n');
  }

  private key(name: string, tags?: Record<string, string>): string {
    const allTags = { ...this.labels, ...tags };
    if (Object.keys(allTags).length === 0) return name;
    const tagStr = Object.entries(allTags)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${tagStr}}`;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}
