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
