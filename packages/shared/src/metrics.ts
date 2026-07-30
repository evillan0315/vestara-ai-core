// ─── Metrics ─────────────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
}

export interface MetricSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}

export interface HistogramSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}
