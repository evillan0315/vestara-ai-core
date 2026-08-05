/**
 * In-memory HTTP request metrics.
 *
 * Tracks aggregate counters only — no request IDs, URLs, query strings, or
 * resource IDs are retained as labels to keep cardinality low.
 */

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';

export interface HttpMetricsSnapshot {
  activeRequests: number;
  totalRequests: number;
  totalErrors: number;
  requestsByStatusClass: Record<StatusClass, number>;
  averageDurationMs: number;
  maxDurationMs: number;
  startedAt: number;
  uptimeMs: number;
}

export class HttpMetrics {
  private startedAt = Date.now();
  private active = 0;
  private total = 0;
  private errors = 0;
  private durationSum = 0;
  private durationCount = 0;
  private maxDuration = 0;
  private readonly byStatusClass: Record<StatusClass, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };

  begin(): void {
    this.active += 1;
    this.total += 1;
  }

  end(statusCode: number, durationMs: number): void {
    this.active = Math.max(0, this.active - 1);
    this.byStatusClass[classify(statusCode)] += 1;
    this.durationSum += durationMs;
    this.durationCount += 1;
    if (durationMs > this.maxDuration) this.maxDuration = durationMs;
    if (statusCode >= 500) this.errors += 1;
  }

  snapshot(): HttpMetricsSnapshot {
    return {
      activeRequests: this.active,
      totalRequests: this.total,
      totalErrors: this.errors,
      requestsByStatusClass: { ...this.byStatusClass },
      averageDurationMs: this.durationCount > 0 ? this.durationSum / this.durationCount : 0,
      maxDurationMs: this.maxDuration,
      startedAt: this.startedAt,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  /** Count an error that occurred before any response was written. */
  recordError(): void {
    this.errors += 1;
  }
}

export const httpMetrics = new HttpMetrics();

function classify(statusCode: number): StatusClass {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  return '5xx';
}
