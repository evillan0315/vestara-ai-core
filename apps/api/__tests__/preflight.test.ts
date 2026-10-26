import { describe, expect, it } from 'vitest';
import { applyLiveSafeDefaults, describePreflight, type ResourceSnapshot, runPreflight } from '../src/preflight';

const GB = 1024 * 1024 * 1024;

function snapshot(overrides: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return {
    availableBytes: 4 * GB,
    totalBytes: 8 * GB,
    diskFreeBytes: 20 * GB,
    diskTotalBytes: 60 * GB,
    liveBoot: false,
    toram: false,
    ...overrides,
  };
}

describe('api startup preflight', () => {
  it('applies low-memory defaults on a toram live boot', () => {
    const env: NodeJS.ProcessEnv = {};
    const applied = applyLiveSafeDefaults(env, snapshot({ liveBoot: true, toram: true }));

    expect(applied).toEqual([
      'VESTARA_SKIP_MEMORY_INDEX=1',
      'VESTARA_EVENT_PERSIST_DEBOUNCE_MS=2000',
      'VESTARA_BROWSER_MAX_SESSIONS=1',
    ]);
    expect(env.VESTARA_SKIP_MEMORY_INDEX).toBe('1');
  });

  it('leaves a healthy non-live host untouched', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(applyLiveSafeDefaults(env, snapshot())).toEqual([]);
    expect(env.VESTARA_SKIP_MEMORY_INDEX).toBeUndefined();
  });

  it('preserves explicit operator settings', () => {
    const env: NodeJS.ProcessEnv = { VESTARA_SKIP_MEMORY_INDEX: '0' };
    applyLiveSafeDefaults(env, snapshot({ liveBoot: true, toram: true }));
    expect(env.VESTARA_SKIP_MEMORY_INDEX).toBe('0');
    expect(env.VESTARA_EVENT_PERSIST_DEBOUNCE_MS).toBe('2000');
  });

  it('can be disabled with VESTARA_LIVE_SAFE=0', () => {
    const env: NodeJS.ProcessEnv = { VESTARA_LIVE_SAFE: '0' };
    expect(applyLiveSafeDefaults(env, snapshot({ liveBoot: true, toram: true }))).toEqual([]);
  });

  it('renders failures in the startup report', () => {
    const lines = describePreflight({
      ok: false,
      snapshot: snapshot(),
      reasons: ['only 0.1 GiB RAM available; need at least 0.8 GiB'],
      notes: ['memory: 0.1 GiB available of 8.0 GiB'],
      applied: ['VESTARA_SKIP_MEMORY_INDEX=1'],
    });

    expect(lines).toContain('FAIL: only 0.1 GiB RAM available; need at least 0.8 GiB');
    expect(lines).toContain('safe default applied: VESTARA_SKIP_MEMORY_INDEX=1');
  });

  it('honors the explicit preflight bypass', () => {
    const result = runPreflight({ VESTARA_SKIP_PREFLIGHT: '1', VESTARA_LIVE_SAFE: '0' }, process.cwd());
    expect(result.ok).toBe(true);
  });

  it('reports an unknown workspace volume instead of inventing free space', () => {
    const missing = '/nonexistent/vestara-workspace-path';
    const result = runPreflight({ VESTARA_SKIP_PREFLIGHT: '1', VESTARA_LIVE_SAFE: '0' }, missing);

    expect(result.snapshot.diskFreeBytes).toBeNull();
    expect(result.snapshot.diskTotalBytes).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.notes).toContain(`workspace volume: unavailable at ${missing} (disk gate skipped)`);
  });
});
