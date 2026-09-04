/**
 * GA-UX-PREMIUM M3 — OpenCode 1.18.27 event → `assistant.execution.v1`
 * projection tests. Deterministic; no server required.
 */

import { describe, expect, it } from 'vitest';
import {
  projectEditStarted,
  projectPermissionRequested,
  projectPermissionResolved,
  projectTerminalCompleted,
  projectTerminalStarted,
  projectTodoSnapshot,
  projectToolCompleted,
  projectToolFailed,
  projectToolStarted,
  projectVerificationUnavailable,
} from '../src/assistant-execution-projection';

const SESSION = 'sess-1';

function event(type: string, payload: Record<string, unknown>, id = `evt-${type}`) {
  return { id, type, payload };
}

describe('assistant-execution-projection — OpenCode 1.18.27 → contract', () => {
  it('tool.called → running tool with callID identity', () => {
    const detail = projectToolStarted(
      event('session.next.tool.called', {
        callID: 'call-1',
        tool: 'read',
        input: { path: '/etc/passwd' },
        assistantMessageID: 'msg-1',
        sessionID: SESSION,
        timestamp: 1000,
      }),
    );
    expect(detail).toBeDefined();
    expect(detail!.kind).toBe('tool');
    if (detail!.kind === 'tool') {
      expect(detail!.operationId).toBe('call-1');
      expect(detail!.tool).toBe('read');
      expect(detail!.state).toBe('running');
      expect(detail!.assistantMessageId).toBe('msg-1');
    }
  });

  it('tool.success → completed tool; preview from text parts only (not result/structured)', () => {
    const detail = projectToolCompleted(
      event('session.next.tool.success', {
        callID: 'call-1',
        tool: 'read',
        content: [{ type: 'text', text: 'const x = 1;' }],
        result: { secret: 'SHOULD-NOT-LEAK' },
        structured: { hidden: 'SHOULD-NOT-LEAK-EITHER' },
        sessionID: SESSION,
        timestamp: 2000,
      }),
    );
    expect(detail!.kind).toBe('tool');
    if (detail!.kind === 'tool') {
      expect(detail!.state).toBe('completed');
      expect(detail!.preview).toBe('const x = 1;');
      expect(detail!.operationId).toBe('call-1');
      expect(JSON.stringify(detail)).not.toContain('SHOULD-NOT-LEAK');
    }
  });

  it('successful tool returning exactly "failed" stays completed (§4)', () => {
    const detail = projectToolCompleted(
      event('session.next.tool.success', {
        callID: 'call-1',
        tool: 'bash',
        content: [{ type: 'text', text: 'failed' }],
        sessionID: SESSION,
        timestamp: 2000,
      }),
    );
    expect(detail!.kind).toBe('tool');
    if (detail!.kind === 'tool') {
      expect(detail!.state).toBe('completed');
      expect(detail!.preview).toBe('failed');
    }
  });

  it('tool.failed → failed tool with bounded error', () => {
    const detail = projectToolFailed(
      event('session.next.tool.failed', {
        callID: 'call-2',
        tool: 'bash',
        error: { type: 'unknown', message: 'command not found' },
        sessionID: SESSION,
        timestamp: 3000,
      }),
    );
    expect(detail!.kind).toBe('tool');
    if (detail!.kind === 'tool') {
      expect(detail!.state).toBe('failed');
      expect(detail!.error).toBe('command not found');
    }
  });

  it('shell.started/ended → terminal with command, bounded output, durationMs', () => {
    const started = projectTerminalStarted(
      event('session.next.shell.started', {
        callID: 'shell-1',
        command: 'echo hello',
        sessionID: SESSION,
        timestamp: 1000,
      }),
    );
    expect(started!.kind).toBe('terminal');
    if (started!.kind === 'terminal') {
      expect(started!.state).toBe('running');
      expect(started!.command).toBe('echo hello');
    }
    const ended = projectTerminalCompleted(
      event('session.next.shell.ended', {
        callID: 'shell-1',
        output: 'hello\n'.repeat(5000),
        sessionID: SESSION,
        timestamp: 2500,
      }),
      1000,
    );
    expect(ended!.kind).toBe('terminal');
    if (ended!.kind === 'terminal') {
      expect(ended!.state).toBe('completed');
      expect(ended!.durationMs).toBe(1500);
      expect(ended!.outputPreview!.length).toBeLessThanOrEqual(2000);
      expect(ended!.cwdProvenance).toBe('unavailable');
    }
  });

  it('permission.v2.asked → safe permission projection (no metadata/save leak)', () => {
    const detail = projectPermissionRequested(
      event('permission.v2.asked', {
        id: 'perm-1',
        action: 'edit',
        resources: ['packages/foo/src/index.ts'],
        metadata: { policy: 'SECRET-POLICY' },
        save: ['edit'],
        sessionID: SESSION,
        source: { callID: 'call-9', messageID: 'msg-9', type: 'tool' },
      }),
    );
    expect(detail!.kind).toBe('permission');
    if (detail!.kind === 'permission') {
      expect(detail!.permissionRequestId).toBe('perm-1');
      expect(detail!.action).toBe('edit');
      expect(detail!.permissionState).toBe('requested');
      expect(detail!.resources).toEqual(['packages/foo/src/index.ts']);
      expect(JSON.stringify(detail)).not.toContain('SECRET-POLICY');
      expect('metadata' in detail!).toBe(false);
      expect('save' in detail!).toBe(false);
    }
  });

  it('permission.v2.replied → resolved with bounded reply', () => {
    const detail = projectPermissionResolved(
      event('permission.v2.replied', {
        requestID: 'perm-1',
        reply: 'once',
        sessionID: SESSION,
      }),
    );
    expect(detail!.kind).toBe('permission');
    if (detail!.kind === 'permission') {
      expect(detail!.permissionState).toBe('resolved');
      expect(detail!.reply).toBe('once');
      expect(detail!.operationId).toBe('perm-1');
    }
  });

  it('todo.updated → opencode task snapshot', () => {
    const detail = projectTodoSnapshot(
      event('todo.updated', {
        sessionID: SESSION,
        todos: [
          { content: 'Investigate', priority: 'high', status: 'pending' },
          { content: 'Fix', priority: 'medium', status: 'completed' },
        ],
      }),
    );
    expect(detail!.kind).toBe('task-snapshot');
    if (detail!.kind === 'task-snapshot') {
      expect(detail!.source).toBe('opencode');
      expect(detail!.todos).toHaveLength(2);
      expect(detail!.todos[0]).toEqual({ title: 'Investigate', status: 'pending' });
    }
  });

  it('file.edited → running edit with repository-relative path', () => {
    const detail = projectEditStarted(event('file.edited', { file: 'packages/foo/src/index.ts' }));
    expect(detail!.kind).toBe('edit');
    if (detail!.kind === 'edit') {
      expect(detail!.file).toBe('packages/foo/src/index.ts');
      expect(detail!.state).toBe('running');
      expect(detail!.diffProvenance).toBe('runtime-provided');
    }
  });

  it('verification projection is explicitly unavailable', () => {
    const detail = projectVerificationUnavailable();
    expect(detail!.kind).toBe('verification');
    if (detail!.kind === 'verification') {
      expect(detail!.evidence).toBe('unavailable');
    }
  });

  it('unknown/malformed events project to nothing (explicit absence)', () => {
    expect(projectToolStarted(event('session.next.step.started', { sessionID: SESSION }))).toBeUndefined();
    expect(projectToolCompleted(event('session.next.tool.called', { callID: 'x' }))).toBeUndefined();
    expect(projectPermissionRequested(event('permission.v2.asked', {}))).toBeUndefined();
  });
});
