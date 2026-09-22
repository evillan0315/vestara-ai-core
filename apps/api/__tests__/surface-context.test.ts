/**
 * AR-REF-001 — surface-context rendering and normalization.
 *
 * Proves:
 * F. Existing Global Assistant behavior is byte-compatible: a singular
 *    `selected` context renders exactly the legacy string, and
 *    normalizeSurfaceContext round-trips the GA shape untouched.
 * G. Plural `selectedReferences` render as one bounded block per entry
 *    (all entries, in order) through the same generic mechanism.
 * Normalize drops malformed entries and caps the wire at 20 (deterministic).
 */

import { describe, expect, it } from 'vitest';
import type { TurnSurfaceContext } from '@vestara/shared';
import { buildSurfaceSystem } from '../src/assistant-opencode-adapter';
import { normalizeSurfaceContext } from '../src/routes/conversations';

// ─── buildSurfaceSystem ──────────────────────────────────────────

describe('AR-REF-001 buildSurfaceSystem', () => {
  it('F. legacy singular selected renders byte-identical to the GA format', () => {
    const context: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'Demo' },
      surface: { routeId: '/r', path: '/r', title: 'Page', section: 'Section' },
      selected: { kind: 'file', id: 'file-1', label: 'open file' },
    };
    expect(buildSurfaceSystem(context)).toBe(
      [
        'Current Vestara application context:',
        'Workspace: Demo',
        'Section: Section',
        'Page: Page',
        'Route: /r',
        'Selected item:',
        'Type: file',
        'ID: file-1',
        'Label: open file',
      ].join('\n'),
    );
  });

  it('G. plural references render every entry in order, user text untouched', () => {
    const context: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'repo' },
      surface: { routeId: '/activity', path: '/activity', title: 'Activity Room', section: 'workspace' },
      selectedReferences: [
        { kind: 'activity', id: 'act-tool-1', label: 'TOOL · bash · Failed' },
        { kind: 'activity', id: 'm9-test-2', label: 'TEST · pnpm test · Failed' },
      ],
    };
    const rendered = buildSurfaceSystem(context) ?? '';
    expect(rendered).toContain('Referenced activities:');
    expect(rendered).toContain('ID: act-tool-1');
    expect(rendered).toContain('Label: TOOL · bash · Failed');
    expect(rendered).toContain('ID: m9-test-2');
    expect(rendered).toContain('Label: TEST · pnpm test · Failed');
    expect(rendered.indexOf('act-tool-1')).toBeLessThan(rendered.indexOf('m9-test-2'));
    expect(rendered).not.toContain('Selected item:');
  });

  it('returns undefined without surface context', () => {
    expect(buildSurfaceSystem(undefined)).toBeUndefined();
  });
});

// ─── normalizeSurfaceContext ─────────────────────────────────────

describe('AR-REF-001 normalizeSurfaceContext', () => {
  const base = {
    workspace: { id: 'ws-1', name: 'Demo' },
    surface: { routeId: '/r', path: '/r', title: 'Page', section: 'Section' },
  };

  it('F. GA singular shape round-trips without a selectedReferences key', () => {
    const out = normalizeSurfaceContext({ ...base, selected: { kind: 'file', id: 'file-1', label: 'open file' } });
    expect(out).toEqual({ ...base, selected: { kind: 'file', id: 'file-1', label: 'open file' } });
    expect(out).not.toHaveProperty('selectedReferences');
  });

  it('preserves valid plural references and drops malformed entries', () => {
    const out = normalizeSurfaceContext({
      ...base,
      selectedReferences: [
        { kind: 'activity', id: 'act-1', label: 'TOOL · bash · Failed' },
        { kind: 'activity', id: 'act-2' },
        { kind: '', id: 'act-3' },
        { kind: 'activity' },
        'not-an-object',
        null,
      ],
    });
    expect(out?.selectedReferences).toEqual([
      { kind: 'activity', id: 'act-1', label: 'TOOL · bash · Failed' },
      { kind: 'activity', id: 'act-2' },
    ]);
  });

  it('caps the wire at 20 entries deterministically', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ kind: 'activity', id: `act-${i}` }));
    const out = normalizeSurfaceContext({ ...base, selectedReferences: many });
    expect(out?.selectedReferences).toHaveLength(20);
    expect(out?.selectedReferences?.[0]).toMatchObject({ id: 'act-0' });
    expect(out?.selectedReferences?.[19]).toMatchObject({ id: 'act-19' });
  });

  it('rejects non-object input', () => {
    expect(normalizeSurfaceContext(null)).toBeUndefined();
    expect(normalizeSurfaceContext('x')).toBeUndefined();
  });
});
