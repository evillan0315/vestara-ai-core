/**
 * GA-TOOL-UX-001B — server-side Read wrapper parse + read observation
 * projection tests. Deterministic; no server required.
 *
 * Verified live grammar (OpenCode 1.18.27 read `state.output`):
 *   <path>{abs}</path>\n<type>file</type>\n<content>\n{numbered}\n[(trailer)]\n</content>
 */

import { describe, expect, it } from 'vitest';
import { parseReadOutput, projectReadObservation } from '../src/assistant-execution-projection';

const REPO = '/home/user/projects/vestara/vestara-ai-core';

function partEvent(part: Record<string, unknown>) {
  return { id: 'evt-1', type: 'message.part.updated', payload: { part } };
}

function readPart(overrides: Record<string, unknown> = {}) {
  return {
    type: 'tool',
    callID: 'call_read1',
    tool: 'read',
    state: {
      status: 'completed',
      input: { filePath: 'apps/api/src/assistant-binding-resolver.ts' },
      output:
        '<path>/home/user/projects/vestara/vestara-ai-core/apps/api/src/assistant-binding-resolver.ts</path>\n<type>file</type>\n<content>\n1: a\n2: b\n\n(End of file - total 42 lines)\n</content>',
      title: 'apps/api/src/assistant-binding-resolver.ts',
      time: { start: 100, end: 200 },
    },
    ...overrides,
  };
}

describe('parseReadOutput — server-side wrapper parse', () => {
  it('parses numbered content, offset, counts, totals', () => {
    const parsed = parseReadOutput(
      '<path>/x/f.ts</path>\n<type>file</type>\n<content>\n1: a\n2: b\n\n(End of file - total 42 lines)\n</content>',
    );
    expect(parsed.contentProvenance).toBe('runtime-provided');
    expect(parsed.rangeProvenance).toBe('runtime-provided');
    expect(parsed.contentPreview).toBe('1: a\n2: b');
    expect(parsed.lineCount).toBe(2);
    expect(parsed.offset).toBe(1);
    expect(parsed.totalLines).toBe(42);
    expect(parsed.contentTruncated).toBe(false);
  });

  it('offset start preserved for partial reads', () => {
    const parsed = parseReadOutput('<path>/x/f.ts</path>\n<type>file</type>\n<content>\n40: x\n41: y\n</content>');
    expect(parsed.offset).toBe(40);
    expect(parsed.lineCount).toBe(2);
    expect(parsed.totalLines).toBeUndefined();
  });

  it('content bounded at 2000 whole lines with truncation flag', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `${i + 1}: ${'x'.repeat(40)}`).join('\n');
    const parsed = parseReadOutput(`<path>/x/f.ts</path>\n<type>file</type>\n<content>\n${lines}\n</content>`);
    expect(parsed.contentPreview!.length).toBeLessThanOrEqual(2000);
    expect(parsed.contentTruncated).toBe(true);
    // Whole lines only — rejoins cleanly.
    expect(parsed.contentPreview!.split('\n').every((l) => /^\d+: /.test(l))).toBe(true);
  });

  it('unknown wrapper yields metadata-only evidence (never guessed)', () => {
    for (const bad of [
      'just some text',
      '<path>/x</path>\n<type>directory</type>\n<content>\n1: a\n</content>',
      '<content>\n1: a\n</content>',
      '',
      undefined,
      42,
    ]) {
      const parsed = parseReadOutput(bad);
      expect(parsed.contentProvenance).toBe('unavailable');
      expect(parsed.rangeProvenance).toBe('unavailable');
      expect(parsed.contentPreview).toBeUndefined();
      expect(parsed.contentTruncated).toBe(false);
    }
  });

  it('empty file yields zero counts without truncation', () => {
    const parsed = parseReadOutput(
      '<path>/x/f.ts</path>\n<type>file</type>\n<content>\n\n(End of file - total 0 lines)\n</content>',
    );
    expect(parsed.contentProvenance).toBe('runtime-provided');
    expect(parsed.lineCount).toBe(0);
    expect(parsed.totalLines).toBe(0);
    expect(parsed.contentTruncated).toBe(false);
  });
});

describe('projectReadObservation — part → read detail', () => {
  it('completed read: relative result path, operationId = callID, parsed evidence', () => {
    const detail = projectReadObservation(partEvent(readPart()), REPO);
    expect(detail).toBeDefined();
    expect(detail!.kind).toBe('read');
    expect(detail!.operationId).toBe('call_read1');
    if (detail!.kind === 'read') {
      expect(detail!.state).toBe('completed');
      expect(detail!.file).toBe('apps/api/src/assistant-binding-resolver.ts');
      expect(detail!.fileProvenance).toBe('runtime-provided');
      expect(detail!.offset).toBe(1);
      expect(detail!.lineCount).toBe(2);
      expect(detail!.totalLines).toBe(42);
      expect(detail!.contentPreview).toBe('1: a\n2: b');
      expect(detail!.durationMs).toBe(100);
    }
  });

  it('root-escaping titles degrade to basename (no depth leak, no absolute path)', () => {
    const dots = projectReadObservation(
      partEvent(readPart({ state: { ...(readPart().state as object), title: '../../../../../tmp/obs-fixture.txt' } })),
      REPO,
    );
    if (dots!.kind === 'read') {
      expect(dots!.file).toBe('obs-fixture.txt');
      expect(dots!.fileProvenance).toBe('runtime-provided');
    }
  });

  it('absolute result title relativized against repo root; outside root degrades to basename', () => {
    const abs = projectReadObservation(
      partEvent(readPart({ state: { ...(readPart().state as object), title: `${REPO}/apps/x.ts` } })),
      REPO,
    );
    if (abs!.kind === 'read') expect(abs!.file).toBe('apps/x.ts');
    const outside = projectReadObservation(
      partEvent(readPart({ state: { ...(readPart().state as object), title: '/etc/hostname' } })),
      REPO,
    );
    if (outside!.kind === 'read') {
      expect(outside!.file).toBe('hostname');
      expect(outside!.file).not.toContain('/');
    }
  });

  it('running read uses request input as request context (no content claims)', () => {
    const detail = projectReadObservation(
      partEvent(
        readPart({
          state: { status: 'running', input: { filePath: 'requested/path.ts' }, time: { start: 100 } },
        }),
      ),
      REPO,
    );
    expect(detail!.kind).toBe('read');
    if (detail!.kind === 'read') {
      expect(detail!.state).toBe('running');
      expect(detail!.file).toBe('requested/path.ts');
      expect(detail!.fileProvenance).toBe('request-context');
      expect(detail!.contentPreview).toBeUndefined();
      expect(detail!.contentProvenance).toBe('unavailable');
    }
  });

  it('failed read without title uses request path as request context with bounded error', () => {
    const detail = projectReadObservation(
      partEvent(
        readPart({
          state: {
            status: 'error',
            input: { filePath: 'requested/path.ts' },
            error: 'ENOENT',
            time: { start: 1, end: 2 },
          },
        }),
      ),
      REPO,
    );
    if (detail!.kind === 'read') {
      expect(detail!.state).toBe('failed');
      expect(detail!.file).toBe('requested/path.ts');
      expect(detail!.fileProvenance).toBe('request-context');
      expect(detail!.error).toBe('ENOENT');
    }
  });

  it('call/result correlation preserved: same callID across lifecycle', () => {
    const running = projectReadObservation(
      partEvent(readPart({ state: { status: 'running', input: { filePath: 'a.ts' }, time: { start: 1 } } })),
      REPO,
    );
    const completed = projectReadObservation(partEvent(readPart()), REPO);
    expect(running!.operationId).toBe('call_read1');
    expect(completed!.operationId).toBe('call_read1');
  });

  it('non-read parts and missing callID fall back (undefined → generic path)', () => {
    expect(
      projectReadObservation(
        partEvent({
          type: 'tool',
          callID: 'c1',
          tool: 'bash',
          state: { status: 'running', input: {}, time: { start: 1 } },
        }),
        REPO,
      ),
    ).toBeUndefined();
    expect(
      projectReadObservation(partEvent({ type: 'tool', tool: 'read', state: { status: 'running', input: {} } }), REPO),
    ).toBeUndefined();
    expect(projectReadObservation({ id: 'e', type: 'session.idle', payload: {} }, REPO)).toBeUndefined();
  });

  it('unparseable output degrades to metadata-only (file kept, no preview)', () => {
    const detail = projectReadObservation(
      partEvent(readPart({ state: { ...(readPart().state as object), output: 'garbage' } })),
      REPO,
    );
    if (detail!.kind === 'read') {
      expect(detail!.file).toBe('apps/api/src/assistant-binding-resolver.ts');
      expect(detail!.contentPreview).toBeUndefined();
      expect(detail!.contentProvenance).toBe('unavailable');
    }
  });

  it('suspicious payload fields never leak (allowlist)', () => {
    const detail = projectReadObservation(
      partEvent(
        readPart({
          state: {
            ...(readPart().state as object),
            input: { filePath: 'a.ts', secret: 'SHOULD-NOT-LEAK', apiKey: 'x' },
          },
        }),
      ),
      REPO,
    );
    expect(JSON.stringify(detail)).not.toContain('SHOULD-NOT-LEAK');
  });
});
