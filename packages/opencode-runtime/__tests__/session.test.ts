import { describe, expect, it } from 'vitest';
import { normalizeDiff, normalizeMessages, normalizeTodos } from '../src/session-normalizers.js';
import { InMemorySessionRegistry, requireSessionOwnership } from '../src/sessions/session-registry.js';

function bindOne(registry: InMemorySessionRegistry, id = 'ses-1', workspaceId = 'ws-1') {
  return registry.bind({
    openCodeSessionId: id,
    vestaraSessionId: 'vestara-1',
    workspaceId,
    createdBy: 'user-1',
  });
}

describe('session binding registry', () => {
  it('binds and retrieves a session', () => {
    const registry = new InMemorySessionRegistry();
    const binding = bindOne(registry);
    expect(registry.count()).toBe(1);
    expect(registry.get('ses-1')?.status).toBe('active');
    expect(binding.createdAt).toBeTruthy();
  });

  it('finds bindings by Vestara session', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry, 'ses-1');
    bindOne(registry, 'ses-2');
    expect(registry.findByVestaraSession('vestara-1')).toHaveLength(2);
  });

  it('updates status and removes', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry);
    registry.updateStatus('ses-1', 'aborted');
    expect(registry.get('ses-1')?.status).toBe('aborted');
    registry.remove('ses-1');
    expect(registry.count()).toBe(0);
  });

  it('correlates execution ids and resolves the owning session', () => {
    const registry = new InMemorySessionRegistry();
    const binding = bindOne(registry);
    registry.correlateExecution('ses-1', 'exec-42');
    const resolved = registry.findByExecution('exec-42');
    expect(resolved?.openCodeSessionId).toBe('ses-1');
    expect(resolved?.executionId).toBe('exec-42');
    expect(registry.get('ses-1')?.executionId).toBe('exec-42');
    expect(binding.executionId).toBeUndefined();
  });

  it('drops execution correlation when the session is removed', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry);
    registry.correlateExecution('ses-1', 'exec-42');
    registry.remove('ses-1');
    expect(registry.findByExecution('exec-42')).toBeUndefined();
  });
});

describe('session ownership', () => {
  it('allows the owning workspace', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry);
    const result = requireSessionOwnership(registry, 'ses-1', { workspaceId: 'ws-1' });
    expect(result.ok).toBe(true);
  });

  it('rejects a session from another workspace', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry);
    const result = requireSessionOwnership(registry, 'ses-1', { workspaceId: 'ws-other' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('OPENCODE_PERMISSION_DENIED');
  });

  it('rejects an unknown session as not found', () => {
    const registry = new InMemorySessionRegistry();
    const result = requireSessionOwnership(registry, 'missing', { workspaceId: 'ws-1' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('OPENCODE_SESSION_NOT_FOUND');
  });

  it('rejects a deleted session', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry);
    registry.updateStatus('ses-1', 'deleted');
    const result = requireSessionOwnership(registry, 'ses-1', { workspaceId: 'ws-1' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('OPENCODE_SESSION_NOT_FOUND');
  });

  it('rejects a mismatched user when provided', () => {
    const registry = new InMemorySessionRegistry();
    bindOne(registry);
    const result = requireSessionOwnership(registry, 'ses-1', { workspaceId: 'ws-1', userId: 'user-2' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('OPENCODE_PERMISSION_DENIED');
  });
});

describe('session normalizers', () => {
  it('normalizes todos and drops empties', () => {
    const todos = normalizeTodos([
      { id: 't1', content: 'Implement x', status: 'pending' },
      { id: 't2', text: 'Test y' },
      { id: 't3', title: 'Done' },
      { content: '' },
    ]);
    expect(todos).toHaveLength(3);
    expect(todos[0]).toMatchObject({ id: 't1', content: 'Implement x', status: 'pending' });
    expect(todos[1]).toMatchObject({ content: 'Test y' });
    expect(todos[2]).toMatchObject({ content: 'Done' });
    expect(normalizeTodos('nope')).toEqual([]);
  });

  it('normalizes diff files with runtime patch evidence (1.18.27 contract)', () => {
    const diff = normalizeDiff([
      {
        file: 'src/a.ts',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: '@@ -1,3 +1,4 @@\n a\n+add\n-remove\n',
      },
    ]);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      path: 'src/a.ts',
      operation: 'modified',
      additions: 2,
      deletions: 1,
      patch: '@@ -1,3 +1,4 @@\n a\n+add\n-remove\n',
    });
    // The 1.18.27 runtime contract has no structured hunks — nothing fabricated.
    expect('hunks' in diff[0]!).toBe(false);
    expect(normalizeDiff('nope')).toEqual([]);
    // Server `path` form also supported (defensive).
    const pathForm = normalizeDiff([{ path: 'b.ts', status: 'added', additions: 1, deletions: 0 }]);
    expect(pathForm[0]!.path).toBe('b.ts');
    // Missing patch stays absent.
    expect(normalizeDiff([{ file: 'c.ts', status: 'modified', additions: 0, deletions: 0 }])[0]!.patch).toBeUndefined();
  });

  it('normalizes message history with nested info and parts', () => {
    const messages = normalizeMessages([
      {
        info: { id: 'msg-1', role: 'user', sessionID: 'ses-1', agent: 'build', time: 1785914381005 },
        parts: [{ id: 'prt-1', type: 'text', text: 'hello' }],
      },
      {
        info: { id: 'msg-2', role: 'assistant', time: 1785914382005 },
        parts: [
          { id: 'prt-2', type: 'text', text: 'hi' },
          { id: 'prt-3', type: 'text', text: 'there' },
        ],
      },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: 'msg-1',
      role: 'user',
      sessionId: 'ses-1',
      agent: 'build',
      text: 'hello',
    });
    expect(messages[0].createdAt).toBe('2026-08-05T07:19:41.005Z');
    expect(messages[1].text).toBe('hi\nthere');
    expect(normalizeMessages('nope')).toEqual([]);
  });

  it('extracts text from info when parts lack text', () => {
    const messages = normalizeMessages([{ info: { id: 'msg-1', role: 'assistant', text: 'direct text' }, parts: [] }]);
    expect(messages[0].text).toBe('direct text');
  });
});
