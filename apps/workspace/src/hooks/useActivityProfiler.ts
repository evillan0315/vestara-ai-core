/**
 * Activity Room Render Profiler
 *
 * Lightweight performance monitoring for Activity Room components.
 * Logs slow renders (>16ms) and tracks render frequency.
 *
 * Usage:
 *   import { useRenderProfiler } from './activity-profiler';
 *   useRenderProfiler('M11CActivityStream');
 *
 * In development, logs to console. In production, no-ops.
 */

import { useEffect, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────

interface RenderProfile {
  componentName: string;
  renderCount: number;
  lastRenderTime: number;
  totalRenderTime: number;
  slowRenders: number;
}

// ─── Global Registry ─────────────────────────────────────────

const profiles = new Map<string, RenderProfile>();

// ─── Hook ────────────────────────────────────────────────────

/**
 * Profile a component's render performance.
 * Logs warnings for renders >16ms.
 */
export function useRenderProfiler(componentName: string): void {
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(0);

  useEffect(() => {
    const startTime = performance.now();
    renderCountRef.current += 1;

    // Get or create profile
    let profile = profiles.get(componentName);
    if (!profile) {
      profile = {
        componentName,
        renderCount: 0,
        lastRenderTime: 0,
        totalRenderTime: 0,
        slowRenders: 0,
      };
      profiles.set(componentName, profile);
    }

    // Measure render time
    const endTime = performance.now();
    const duration = endTime - startTime;

    profile.renderCount += 1;
    profile.lastRenderTime = duration;
    profile.totalRenderTime += duration;

    if (duration > 16) {
      profile.slowRenders += 1;
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[AR-Profiler] ${componentName} slow render: ${duration.toFixed(1)}ms ` +
          `(render #${profile.renderCount})`,
        );
      }
    }
  });
}

/**
 * Get all render profiles (for debugging).
 */
export function getRenderProfiles(): ReadonlyMap<string, RenderProfile> {
  return profiles;
}

/**
 * Log a summary of all render profiles.
 */
export function logRenderSummary(): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.group('[AR-Profiler] Render Summary');
  for (const [name, profile] of profiles) {
    const avgTime = profile.renderCount > 0
      ? (profile.totalRenderTime / profile.renderCount).toFixed(1)
      : '0';
    console.log(
      `${name}: ${profile.renderCount} renders, ` +
      `${avgTime}ms avg, ${profile.slowRenders} slow`,
    );
  }
  console.groupEnd();
}

/**
 * Clear all render profiles.
 */
export function clearRenderProfiles(): void {
  profiles.clear();
}
