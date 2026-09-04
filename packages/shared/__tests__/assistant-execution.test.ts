/**
 * GA-UX-PREMIUM M3 — `assistant.execution.v1` contract tests.
 *
 * Covers §15: stable identity, explicit lifecycle (never output-text-derived),
 * bounds, sanitization allowlist, provenance, unknown-version/kind degradation.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_EXECUTION_BOUNDS,
  ASSISTANT_EXECUTION_CONTRACT,
  ASSISTANT_EXECUTION_VERSION,
  isAssistantExecutionDetail,
  normalizeAssistantExecutionDetail,
} from '../src/assistant-execution';

const BASE = {
  contract: ASSISTANT_EXECUTION_CONTRACT,
  version: ASSISTANT_EXECUTION_VERSION,
  operationId: 'call_abc123',
  state: 'completed',
  timestamp: 1_700_000_000_000,
};

describe('normalizeAssistantExecutionDetail — §15 contract matrix', () => {
  it('stable operation identity is preserved verbatim', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'tool',
      tool: 'read',
    });
    expect(detail).toBeDefined();
    expect(detail!.operationId).toBe('call_abc123');
    expect(detail!.contract).toBe(ASSISTANT_EXECUTION_CONTRACT);
    expect(detail!.version).toBe(ASSISTANT_EXECUTION_VERSION);
  });

  it('started → completed correlation keeps one identity', () => {
    const started = normalizeAssistantExecutionDetail({ ...BASE, state: 'running', kind: 'tool', tool: 'read' });
    const completed = normalizeAssistantExecutionDetail({ ...BASE, state: 'completed', kind: 'tool', tool: 'read' });
    expect(started!.operationId).toBe(completed!.operationId);
    expect(started!.state).toBe('running');
    expect(completed!.state).toBe('completed');
  });

  it('started → failed correlation keeps one identity', () => {
    const started = normalizeAssistantExecutionDetail({ ...BASE, state: 'running', kind: 'tool', tool: 'read' });
    const failed = normalizeAssistantExecutionDetail({ ...BASE, state: 'failed', kind: 'tool', tool: 'read' });
    expect(started!.operationId).toBe(failed!.operationId);
    expect(failed!.state).toBe('failed');
  });

  it('successful output exactly "failed" remains successful (§4 regression)', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'tool',
      tool: 'bash',
      state: 'completed',
      preview: 'failed',
    });
    expect(detail).toBeDefined();
    expect(detail!.state).toBe('completed');
    expect(detail!.kind).toBe('tool');
  });

  it('unknown tool name degrades safely to a generic operation', () => {
    const detail = normalizeAssistantExecutionDetail({ ...BASE, kind: 'tool', tool: 'some_future_tool' });
    expect(detail).toBeDefined();
    expect(detail!.kind).toBe('tool');
    expect(detail!.tool).toBe('some_future_tool');
  });

  it('unknown kind degrades safely to generic (never crashes)', () => {
    const detail = normalizeAssistantExecutionDetail({ ...BASE, kind: 'future.v2.kind', preview: 'x' });
    expect(detail).toBeDefined();
    expect(detail!.kind).toBe('generic');
  });

  it('unknown structured version is rejected (undefined → legacy path)', () => {
    expect(normalizeAssistantExecutionDetail({ ...BASE, version: 99 })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...BASE, contract: 'assistant.execution.v2' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail(undefined)).toBeUndefined();
    expect(normalizeAssistantExecutionDetail(null)).toBeUndefined();
  });

  it('oversized output is bounded (preview ≤ 200, terminal ≤ 2000)', () => {
    const huge = 'x'.repeat(5000);
    const tool = normalizeAssistantExecutionDetail({ ...BASE, kind: 'tool', tool: 'read', preview: huge });
    expect(tool!.kind).toBe('tool');
    if (tool!.kind === 'tool') {
      expect(tool!.preview!.length).toBeLessThanOrEqual(ASSISTANT_EXECUTION_BOUNDS.preview);
    }
    const terminal = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'terminal',
      command: 'echo hi',
      outputPreview: huge,
    });
    if (terminal!.kind === 'terminal') {
      expect(terminal!.outputPreview!.length).toBeLessThanOrEqual(ASSISTANT_EXECUTION_BOUNDS.terminalOutputPreview);
    }
  });

  it('unsafe fields are excluded — only allowlisted fields survive (sanitization)', () => {
    const poisoned = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'tool',
      tool: 'bash',
      systemPrompt: 'TOP SECRET SYSTEM PROMPT',
      hiddenReasoning: 'chain-of-thought',
      credentials: { apiKey: 'sk-secret' },
      environment: { OPENAI_API_KEY: 'sk-secret' },
      authorizationHeaders: { Authorization: 'Bearer sk-secret' },
      rawToolArguments: 'rm -rf /',
      openCodeInternal: { sessionSecret: 'x' },
      preview: 'safe output',
    });
    expect(poisoned).toBeDefined();
    const json = JSON.stringify(poisoned);
    expect(json).not.toContain('TOP SECRET');
    expect(json).not.toContain('chain-of-thought');
    expect(json).not.toContain('sk-secret');
    expect(json).not.toContain('rm -rf');
    expect(json).not.toContain('authorization');
    // Allowlisted field survived.
    expect(json).toContain('safe output');
  });

  it('reasoning is excluded — detail never carries chain-of-thought', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'tool',
      tool: 'read',
      reasoning: 'I thought about X then Y',
    });
    expect(JSON.stringify(detail)).not.toContain('I thought about X');
  });

  it('permission request is projected with safe fields only (no authority mutation)', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      operationId: 'perm-request-1',
      kind: 'permission',
      permissionRequestId: 'perm-request-1',
      action: 'edit',
      resources: ['packages/foo/src/index.ts'],
      state: 'running',
      metadata: { policy: 'secret-policy-detail' },
      save: ['edit'],
    });
    expect(detail).toBeDefined();
    if (detail!.kind === 'permission') {
      expect(detail!.permissionRequestId).toBe('perm-request-1');
      expect(detail!.action).toBe('edit');
      expect(detail!.permissionState).toBe('requested');
      expect(detail!.resources).toEqual(['packages/foo/src/index.ts']);
      // No authority-mutating fields leak through (no metadata, no save).
      expect('metadata' in detail!).toBe(false);
      expect('save' in detail!).toBe(false);
      expect(detail!.reply).toBeUndefined();
    }
  });

  it('permission resolution carries the bounded reply', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      operationId: 'perm-request-1',
      kind: 'permission',
      permissionRequestId: 'perm-request-1',
      action: 'bash',
      resources: [],
      state: 'completed',
      reply: 'once',
    });
    if (detail!.kind === 'permission') {
      expect(detail!.permissionState).toBe('resolved');
      expect(detail!.reply).toBe('once');
    }
  });

  it('edit provenance is explicit (runtime-provided diff, unavailable before/after)', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'edit',
      file: 'packages/foo/src/index.ts',
      operation: 'modified',
      additions: 4,
      deletions: 2,
      diffProvenance: 'runtime-provided',
    });
    if (detail!.kind === 'edit') {
      expect(detail!.file).toBe('packages/foo/src/index.ts');
      expect(detail!.diffProvenance).toBe('runtime-provided');
      expect(detail!.beforeAfterProvenance).toBe('unavailable');
      expect(detail!.additions).toBe(4);
      expect(detail!.deletions).toBe(2);
    }
  });

  it('task provenance is opencode — never merged with vestara-workflow', () => {
    const opencode = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'task-snapshot',
      source: 'opencode',
      todos: [
        { content: 'Do a thing', status: 'pending' },
        { content: 'Done thing', status: 'completed' },
      ],
    });
    if (opencode!.kind === 'task-snapshot') {
      expect(opencode!.source).toBe('opencode');
      expect(opencode!.todos).toHaveLength(2);
      expect(opencode!.todos[0]).toEqual({ title: 'Do a thing', status: 'pending' });
    }
    // A vestara-workflow payload is NOT silently accepted as opencode authority.
    const workflow = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'task-snapshot',
      source: 'vestara-workflow',
      todos: [{ content: 'wf', status: 'running' }],
    });
    if (workflow!.kind === 'task-snapshot') {
      expect(workflow!.source).toBe('opencode'); // normalizer pins opencode for task-snapshot
    }
  });

  it('terminal fields are bounded and provenance-explicit', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'terminal',
      state: 'completed',
      command: 'pnpm test -- --runInBand',
      cwd: '/home/user/projects/vestara/vestara-ai-core',
      exitCode: 0,
      durationMs: 1234,
      outputPreview: 'Tests passed',
      cwdProvenance: 'runtime-provided',
      exitCodeProvenance: 'runtime-provided',
    });
    if (detail!.kind === 'terminal') {
      expect(detail!.command).toBe('pnpm test -- --runInBand');
      expect(detail!.cwd).toBe('/home/user/projects/vestara/vestara-ai-core');
      expect(detail!.exitCode).toBe(0);
      expect(detail!.durationMs).toBe(1234);
      expect(detail!.cwdProvenance).toBe('runtime-provided');
      expect(detail!.exitCodeProvenance).toBe('runtime-provided');
    }
  });

  it('terminal cwd is never inferred — provenance stays unavailable when absent', () => {
    const detail = normalizeAssistantExecutionDetail({ ...BASE, kind: 'terminal', state: 'completed' });
    if (detail!.kind === 'terminal') {
      expect(detail!.cwd).toBeUndefined();
      expect(detail!.cwdProvenance).toBe('unavailable');
    }
  });

  it('verification projection is explicitly unavailable (no authoritative source)', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'verification',
      state: 'failed',
      evidence: 'unavailable',
    });
    if (detail!.kind === 'verification') {
      expect(detail!.evidence).toBe('unavailable');
      expect(detail!.verdict).toBeUndefined();
    }
  });

  it('artifact projection carries a bounded repository-relative file', () => {
    const detail = normalizeAssistantExecutionDetail({
      ...BASE,
      kind: 'artifact',
      file: 'packages/foo/dist/out.js',
    });
    if (detail!.kind === 'artifact') {
      expect(detail!.file).toBe('packages/foo/dist/out.js');
    }
  });

  it('invalid operationId/state are rejected (fail-closed)', () => {
    expect(normalizeAssistantExecutionDetail({ ...BASE, operationId: '' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...BASE, operationId: 42 })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...BASE, state: 'succeeded' })).toBeUndefined();
    expect(normalizeAssistantExecutionDetail({ ...BASE, operationId: undefined })).toBeUndefined();
  });

  it('isAssistantExecutionDetail guard agrees with the normalizer', () => {
    expect(isAssistantExecutionDetail({ ...BASE, kind: 'tool', tool: 'read' })).toBe(true);
    expect(isAssistantExecutionDetail({ ...BASE, version: 99 })).toBe(false);
  });
});

// ─── GA-UX-PREMIUM M3.1 — edit hunk projection contract repair ───

const EDIT_BASE = {
  ...BASE,
  kind: 'edit',
  state: 'completed',
  file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx',
  operation: 'modified',
  additions: 5,
  deletions: 4,
  diffProvenance: 'runtime-provided',
} as const;

const HUNK = { oldStart: 497, oldLines: 4, newStart: 497, newLines: 4, content: ' context\n+added\n-removed' } as const;

describe('M3.1 — bounded runtime hunk projection', () => {
  it('one hunk survives normalization with all fields preserved', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [HUNK] });
    expect(d!.kind).toBe('edit');
    if (d!.kind === 'edit') {
      expect(d!.hunks).toEqual([HUNK]);
      expect(d!.hunksTruncated).toBeUndefined();
    }
  });

  it('multiple hunks preserve upstream order', () => {
    const d = normalizeAssistantExecutionDetail({
      ...EDIT_BASE,
      hunks: [
        { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, content: ' a' },
        { oldStart: 40, oldLines: 3, newStart: 41, newLines: 3, content: ' b' },
      ],
    });
    if (d!.kind === 'edit') {
      expect(d!.hunks!.map((h) => h.oldStart)).toEqual([1, 40]);
      expect(d!.hunks![0]!.content).toBe(' a');
      expect(d!.hunks![1]!.content).toBe(' b');
    }
  });

  it('content is preserved verbatim when under bounds (leading diff markers intact)', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [{ content: '  ctx\n+ add\n- del\n' }] });
    if (d!.kind === 'edit') {
      expect(d!.hunks![0]!.content).toBe('  ctx\n+ add\n- del\n');
    }
  });

  it('line metadata (oldStart/oldLines/newStart/newLines) is preserved when supplied', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [HUNK] });
    if (d!.kind === 'edit') {
      expect(d!.hunks![0]).toMatchObject({
        oldStart: 497,
        oldLines: 4,
        newStart: 497,
        newLines: 4,
      });
    }
  });

  it('absent line fields remain absent (never manufactured)', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [{ content: 'x' }] });
    if (d!.kind === 'edit') {
      const hunk = d!.hunks![0]!;
      // undefined values serialize away — nothing is manufactured as 0/1/prev+1.
      expect(hunk.oldStart).toBeUndefined();
      expect(hunk.oldLines).toBeUndefined();
      expect(hunk.newStart).toBeUndefined();
      expect(hunk.newLines).toBeUndefined();
      expect(hunk.content).toBe('x');
      expect(JSON.stringify(hunk)).not.toContain('oldStart');
      expect(JSON.stringify(hunk)).not.toContain('newLines');
    }
  });

  it('hunk count is bounded (excess dropped, truncation flagged)', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ oldStart: i, content: 'x' }));
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: many });
    if (d!.kind === 'edit') {
      expect(d!.hunks!.length).toBe(50);
      expect(d!.hunksTruncated).toBe(true);
    }
  });

  it('per-hunk content is bounded', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [{ content: 'y'.repeat(1500) }] });
    if (d!.kind === 'edit') {
      expect(d!.hunks![0]!.content.length).toBe(1000);
      expect(d!.hunksTruncated).toBe(true);
    }
  });

  it('aggregate hunk content is bounded', () => {
    const big = Array.from({ length: 20 }, () => ({ content: 'z'.repeat(500) }));
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: big });
    if (d!.kind === 'edit') {
      const total = d!.hunks!.reduce((n, h) => n + h.content.length, 0);
      expect(total).toBeLessThanOrEqual(8000);
      expect(d!.hunksTruncated).toBe(true);
    }
  });

  it('hunksTruncated is false (absent) for a complete projection', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [HUNK] });
    if (d!.kind === 'edit') {
      expect(d!.hunksTruncated).toBeUndefined();
    }
  });

  it('hunksTruncated is true whenever evidence is lost', () => {
    for (const payload of [
      { ...EDIT_BASE, hunks: Array.from({ length: 60 }, () => ({ content: 'x' })) },
      { ...EDIT_BASE, hunks: [{ content: 'y'.repeat(1500) }] },
      { ...EDIT_BASE, hunks: Array.from({ length: 20 }, () => ({ content: 'z'.repeat(500) })) },
      { ...EDIT_BASE, hunks: [{ content: 42 as unknown }] },
      { ...EDIT_BASE, hunks: [{ content: 'ok' }, 'not-an-object'] },
    ]) {
      const d = normalizeAssistantExecutionDetail(payload);
      if (d!.kind === 'edit') expect(d!.hunksTruncated).toBe(true);
    }
  });

  it('additions/deletions/operation/path remain unchanged by hunk projection', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [HUNK] });
    if (d!.kind === 'edit') {
      expect(d!.additions).toBe(5);
      expect(d!.deletions).toBe(4);
      expect(d!.operation).toBe('modified');
      expect(d!.file).toBe('apps/workspace/src/components/assistant/ConversationPanel.tsx');
    }
  });

  it('diffProvenance stays runtime-provided; beforeAfterProvenance stays unavailable', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE, hunks: [HUNK] });
    if (d!.kind === 'edit') {
      expect(d!.diffProvenance).toBe('runtime-provided');
      expect(d!.beforeAfterProvenance).toBe('unavailable');
    }
  });

  it('arbitrary upstream hunk/runtime fields are excluded', () => {
    const d = normalizeAssistantExecutionDetail({
      ...EDIT_BASE,
      hunks: [{ oldStart: 1, content: 'x', secret: 'TOP-SECRET', raw: { a: 1 }, hiddenReasoning: 'r' }],
      systemPrompt: 'S',
    });
    const json = JSON.stringify(d);
    expect(json).not.toContain('TOP-SECRET');
    expect(json).not.toContain('hiddenReasoning');
    expect(json).not.toContain('systemPrompt');
    if (d!.kind === 'edit') {
      expect('secret' in d!.hunks![0]!).toBe(false);
      expect('raw' in d!.hunks![0]!).toBe(false);
    }
  });

  it('existing M3 edit payloads without hunks remain valid', () => {
    const d = normalizeAssistantExecutionDetail({ ...EDIT_BASE });
    expect(d!.kind).toBe('edit');
    if (d!.kind === 'edit') {
      expect(d!.hunks).toBeUndefined();
      expect(d!.hunksTruncated).toBeUndefined();
    }
  });

  it('unknown execution versions still degrade safely with hunk payloads', () => {
    expect(normalizeAssistantExecutionDetail({ ...EDIT_BASE, version: 99, hunks: [HUNK] })).toBeUndefined();
    expect(
      normalizeAssistantExecutionDetail({ ...EDIT_BASE, contract: 'assistant.execution.v2', hunks: [HUNK] }),
    ).toBeUndefined();
  });

  it('malformed content (not a string) drops the hunk and flags truncation', () => {
    const d = normalizeAssistantExecutionDetail({
      ...EDIT_BASE,
      hunks: [{ content: 42 }, { oldStart: 5, content: ' ok' }],
    });
    if (d!.kind === 'edit') {
      expect(d!.hunks).toEqual([{ oldStart: 5, content: ' ok' }]);
      expect(d!.hunksTruncated).toBe(true);
    }
  });

  it('invalid numeric line metadata degrades to absent (never fabricated)', () => {
    const d = normalizeAssistantExecutionDetail({
      ...EDIT_BASE,
      hunks: [{ oldStart: -1, oldLines: '3', newStart: NaN, content: 'x' }],
    });
    if (d!.kind === 'edit') {
      const hunk = d!.hunks![0]!;
      expect(hunk.oldStart).toBeUndefined();
      expect(hunk.oldLines).toBeUndefined();
      expect(hunk.newStart).toBeUndefined();
      expect(hunk.content).toBe('x');
      expect(d!.hunksTruncated).toBeUndefined(); // invalid metadata is not evidence loss
    }
  });

  it('validator accepts valid hunk payloads and rejects malformed ones (no generic-record weakening)', () => {
    expect(isAssistantExecutionDetail({ ...EDIT_BASE, hunks: [HUNK] })).toBe(true);
    expect(isAssistantExecutionDetail({ ...EDIT_BASE, hunks: [{ content: 'x' }] })).toBe(true);
    expect(isAssistantExecutionDetail({ ...EDIT_BASE, hunks: 'not-an-array' })).toBe(true); // absent → valid, no hunks
    expect(isAssistantExecutionDetail({ ...EDIT_BASE, file: '' })).toBe(false);
    expect(isAssistantExecutionDetail({ ...EDIT_BASE, operationId: '' })).toBe(false);
  });
});
