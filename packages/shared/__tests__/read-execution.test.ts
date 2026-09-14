/**
 * GA-TOOL-UX-001B — `read` execution detail contract tests.
 *
 * Covers: successful Read projection, relative result path, absolute-path
 * rejection, content bound ≤2000, truncation flag, offset/range evidence,
 * unknown-wrapper degradation (via missing fields), failed provenance,
 * operationId = callID preservation, generic compatibility for other tools.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_EXECUTION_BOUNDS,
  ASSISTANT_EXECUTION_CONTRACT,
  ASSISTANT_EXECUTION_VERSION,
  normalizeAssistantExecutionDetail,
} from '../src/assistant-execution';

const BASE = {
  contract: ASSISTANT_EXECUTION_CONTRACT,
  version: ASSISTANT_EXECUTION_VERSION,
  operationId: 'call_read1',
  state: 'completed',
  timestamp: 1_700_000_000_000,
};

const READ_BASE = {
  ...BASE,
  kind: 'read',
  tool: 'read',
  file: 'apps/api/src/assistant-binding-resolver.ts',
  fileProvenance: 'runtime-provided',
  offset: 1,
  lineCount: 42,
  totalLines: 311,
  contentPreview: '1: a\n2: b',
  contentTruncated: false,
  contentProvenance: 'runtime-provided',
  rangeProvenance: 'runtime-provided',
};

describe('normalizeAssistantExecutionDetail — read kind', () => {
  it('successful Read projection preserves operation identity and evidence', () => {
    const detail = normalizeAssistantExecutionDetail(READ_BASE);
    expect(detail).toBeDefined();
    expect(detail!.kind).toBe('read');
    if (detail!.kind === 'read') {
      expect(detail!.operationId).toBe('call_read1');
      expect(detail!.state).toBe('completed');
      expect(detail!.file).toBe('apps/api/src/assistant-binding-resolver.ts');
      expect(detail!.fileProvenance).toBe('runtime-provided');
      expect(detail!.offset).toBe(1);
      expect(detail!.lineCount).toBe(42);
      expect(detail!.totalLines).toBe(311);
      expect(detail!.contentPreview).toBe('1: a\n2: b');
      expect(detail!.contentTruncated).toBe(false);
      expect(detail!.contentProvenance).toBe('runtime-provided');
      expect(detail!.rangeProvenance).toBe('runtime-provided');
    }
  });

  it('relative result path accepted; request-context provenance preserved', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...READ_BASE,
      state: 'running',
      file: 'requested/path.ts',
      fileProvenance: 'request-context',
    });
    expect(detail!.kind).toBe('read');
    if (detail!.kind === 'read') {
      expect(detail!.fileProvenance).toBe('request-context');
      // Running carries no content/range evidence.
      expect(detail!.contentPreview).toBeUndefined();
      expect(detail!.contentProvenance).toBe('unavailable');
      expect(detail!.rangeProvenance).toBe('unavailable');
    }
  });

  it('absolute paths are rejected (never persisted or presented)', () => {
    expect(normalizeAssistantExecutionDetail({ ...READ_BASE, file: '/home/user/proj/secret.ts' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...READ_BASE, file: 'C:\\work\\f.ts' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...READ_BASE, file: '' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...READ_BASE })).toBeDefined();
  });

  it('root-escaping relative paths are rejected', () => {
    expect(
      normalizeAssistantExecutionDetail({ ...READ_BASE, file: '../../../../../tmp/obs-fixture.txt' }),
    ).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...READ_BASE, file: 'docs/../notes.md' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...READ_BASE, file: 'docs/notes.md' })).toBeDefined();
  });

  it('content bounded at 2000 chars', () => {
    const big = '1: ' + 'x'.repeat(5000);
    const detail = normalizeAssistantExecutionDetail({ ...READ_BASE, contentPreview: big });
    expect(detail!.kind).toBe('read');
    if (detail!.kind === 'read') {
      expect(detail!.contentPreview!.length).toBeLessThanOrEqual(ASSISTANT_EXECUTION_BOUNDS.readContentPreview);
      expect(detail!.contentPreview!.length).toBe(ASSISTANT_EXECUTION_BOUNDS.readContentPreview);
    }
  });

  it('truncation flag preserved; running never carries preview', () => {
    const truncated = normalizeAssistantExecutionDetail({ ...READ_BASE, contentTruncated: true });
    if (truncated!.kind === 'read') expect(truncated!.contentTruncated).toBe(true);
    const running = normalizeAssistantExecutionDetail({
      ...READ_BASE,
      state: 'running',
      contentPreview: '1: a',
      contentTruncated: true,
    });
    if (running!.kind === 'read') {
      expect(running!.contentPreview).toBeUndefined();
      expect(running!.contentTruncated).toBe(false);
    }
  });

  it('offset/range represented; invalid numbers become undefined', () => {
    const detail = normalizeAssistantExecutionDetail({ ...READ_BASE, offset: -1, lineCount: 1.5, totalLines: 'x' });
    if (detail!.kind === 'read') {
      expect(detail!.offset).toBeUndefined();
      expect(detail!.lineCount).toBeUndefined();
      expect(detail!.totalLines).toBeUndefined();
    }
  });

  it('failed Read carries bounded error and request-context file when title absent', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...READ_BASE,
      state: 'failed',
      file: 'requested/path.ts',
      fileProvenance: 'request-context',
      error: 'ENOENT: no such file',
    });
    expect(detail!.kind).toBe('read');
    if (detail!.kind === 'read') {
      expect(detail!.state).toBe('failed');
      expect(detail!.error).toBe('ENOENT: no such file');
      expect(detail!.fileProvenance).toBe('request-context');
      expect(detail!.contentPreview).toBeUndefined();
    }
  });

  it('failed Read without error still normalizes (error stays undefined)', () => {
    const detail = normalizeAssistantExecutionDetail({ ...READ_BASE, state: 'failed' });
    if (detail!.kind === 'read') expect(detail!.error).toBeUndefined();
  });

  it('generic tools remain compatible (read addition changes nothing)', () => {
    const detail = normalizeAssistantExecutionDetail({ ...BASE, kind: 'tool', tool: 'bash' });
    expect(detail!.kind).toBe('tool');
  });

  it('unknown kind still degrades to generic', () => {
    const detail = normalizeAssistantExecutionDetail({ ...BASE, kind: 'watch' });
    expect(detail!.kind).toBe('generic');
  });
});
