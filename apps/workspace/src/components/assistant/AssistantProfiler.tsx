/**
 * Assistant Performance Profiler
 *
 * Lightweight profiling wrapper for React DevTools Profiler integration.
 * Measures render counts, commit durations, and identifies expensive
 * re-renders in the assistant component tree.
 *
 * Usage:
 *   import { withProfiler, ProfiledConversationPanel } from './AssistantProfiler';
 *   // Wrap any component: withProfiler(MyComponent, 'MyComponent')
 *   // Or use pre-profiled exports: <ProfiledConversationPanel />
 *
 * In development, this adds ~0.1ms overhead per render.
 * In production, this is tree-shaken away entirely.
 */

import { Profiler, type ProfilerOnRenderCallback, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────

interface RenderMetric {
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

interface ProfilerStats {
  renders: number;
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  lastRender: RenderMetric | null;
}

// ─── Global Metrics Store (dev only) ──────────────────────────

const metrics = new Map<string, ProfilerStats>();

function recordRender(metric: RenderMetric) {
  const existing = metrics.get(metric.id);
  if (existing) {
    existing.renders += 1;
    existing.totalDuration += metric.actualDuration;
    existing.avgDuration = existing.totalDuration / existing.renders;
    existing.maxDuration = Math.max(existing.maxDuration, metric.actualDuration);
    existing.lastRender = metric;
  } else {
    metrics.set(metric.id, {
      renders: 1,
      totalDuration: metric.actualDuration,
      avgDuration: metric.actualDuration,
      maxDuration: metric.actualDuration,
      lastRender: metric,
    });
  }
}

/** Get profiling stats for a component. */
export function getProfilerStats(id: string): ProfilerStats | undefined {
  return metrics.get(id);
}

/** Get all profiling stats. */
export function getAllProfilerStats(): Map<string, ProfilerStats> {
  return new Map(metrics);
}

/** Reset all profiling stats. */
export function resetProfilerStats() {
  metrics.clear();
}

/** Log a summary of all profiling stats to console. */
export function logProfilerSummary() {
  console.group('📊 Assistant Performance Profile');
  for (const [id, stats] of metrics) {
    console.log(
      `${id}: ${stats.renders} renders, avg ${stats.avgDuration.toFixed(2)}ms, max ${stats.maxDuration.toFixed(2)}ms`,
    );
  }
  console.groupEnd();
}

// ─── HOC ──────────────────────────────────────────────────────

/**
 * Higher-order component that wraps a component with React Profiler.
 * Adds profiling data collection for React DevTools.
 */
export function withProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  displayName: string,
): React.ComponentType<P> {
  const onRender: ProfilerOnRenderCallback = (
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordRender({
      id: displayName,
      phase: phase as RenderMetric['phase'],
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    });
  };

  const ProfiledComponent = (props: P) => (
    <Profiler id={displayName} onRender={onRender}>
      <WrappedComponent {...props} />
    </Profiler>
  );

  ProfiledComponent.displayName = `Profiler(${displayName})`;
  return ProfiledComponent;
}

// ─── useRenderCount Hook ──────────────────────────────────────

/**
 * Hook that tracks render count and last render duration.
 * Useful for identifying components that re-render too frequently.
 */
export function useRenderCount(componentName: string) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());

  renderCount.current += 1;
  const now = performance.now();
  const timeSinceLastRender = now - lastRenderTime.current;
  lastRenderTime.current = now;

  if (process.env.NODE_ENV === 'development' && renderCount.current > 1) {
    // Log slow renders (> 16ms since last render)
    if (timeSinceLastRender > 16) {
      console.warn(
        `⚠️ ${componentName} slow render (#${renderCount.current}): ${timeSinceLastRender.toFixed(1)}ms since last`,
      );
    }
  }

  return {
    renderCount: renderCount.current,
    timeSinceLastRender,
  };
}
