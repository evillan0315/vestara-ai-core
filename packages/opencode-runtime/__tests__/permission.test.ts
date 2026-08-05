import { describe, expect, it } from 'vitest';
import { InMemoryPermissionRegistry, requirePendingPermission } from '../src/permissions/permission-registry';
import { normalizePermissionRequest } from '../src/permissions/permission-types';

describe('normalizePermissionRequest', () => {
  it('normalizes a v1 permission.asked payload', () => {
    const request = normalizePermissionRequest({
      id: 'per_1',
      sessionID: 'ses_1',
      permission: 'write',
      patterns: ['/home/user/project/src/**'],
      metadata: { source: 'tool' },
    });
    expect(request).toMatchObject({
      id: 'per_1',
      sessionId: 'ses_1',
      permission: 'write',
      action: 'write',
      risk: 'dangerous',
    });
    expect(request?.resources).toEqual(['/home/user/project/src/**']);
  });

  it('normalizes a v2 permission.asked payload', () => {
    const request = normalizePermissionRequest({
      id: 'per_2',
      sessionID: 'ses_2',
      action: 'bash',
      resources: ['whoami'],
      save: ['bash:whoami'],
      source: { type: 'tool', messageID: 'msg_1', callID: 'call_1' },
    });
    expect(request).toMatchObject({
      id: 'per_2',
      sessionId: 'ses_2',
      action: 'bash',
      risk: 'dangerous',
      source: { type: 'tool', messageId: 'msg_1', callId: 'call_1' },
    });
    expect(request?.resources).toEqual(['whoami']);
    expect(request?.save).toEqual(['bash:whoami']);
  });

  it('classifies read as safe and webfetch as sensitive', () => {
    expect(normalizePermissionRequest({ id: 'p1', action: 'read', resources: ['x'] })?.risk).toBe('safe');
    expect(normalizePermissionRequest({ id: 'p2', action: 'webfetch', resources: ['x'] })?.risk).toBe('sensitive');
  });

  it('drops malformed payloads without an id', () => {
    expect(normalizePermissionRequest({ action: 'read' })).toBeUndefined();
    expect(normalizePermissionRequest(undefined)).toBeUndefined();
  });
});

describe('InMemoryPermissionRegistry', () => {
  it('records and lists pending requests per workspace', () => {
    const registry = new InMemoryPermissionRegistry();
    registry.record(
      { id: 'per_1', action: 'bash', resources: ['whoami'], risk: 'dangerous', askedAt: 'now' },
      'ws-1',
      'agent-1',
    );
    registry.record({ id: 'per_2', action: 'read', resources: ['x'], risk: 'safe', askedAt: 'now' }, 'ws-2', 'agent-2');
    expect(registry.listPending('ws-1')).toHaveLength(1);
    expect(registry.listPending()).toHaveLength(2);
    expect(registry.count()).toBe(2);
  });

  it('decides a pending request and expires others', () => {
    const registry = new InMemoryPermissionRegistry();
    registry.record(
      { id: 'per_1', action: 'bash', resources: ['whoami'], risk: 'dangerous', askedAt: 'now' },
      'ws-1',
      'agent-1',
    );
    const decided = registry.decide('per_1', { decision: 'approve', scope: 'once', decidedBy: 'user-1' });
    expect(decided?.status).toBe('approved');
    expect(decided?.decisionScope).toBe('once');
    expect(registry.decide('per_1', { decision: 'reject', decidedBy: 'user-1' })).toBeUndefined();
    expect(registry.listPending('ws-1')).toHaveLength(0);
  });

  it('enforces workspace ownership via requirePendingPermission', () => {
    const registry = new InMemoryPermissionRegistry();
    registry.record({ id: 'per_1', action: 'read', resources: ['x'], risk: 'safe', askedAt: 'now' }, 'ws-1', 'agent-1');
    const ok = requirePendingPermission(registry, 'per_1', 'ws-1');
    expect('record' in ok && ok.record.id).toBe('per_1');
    const wrong = requirePendingPermission(registry, 'per_1', 'ws-other');
    expect('error' in wrong).toBe(true);
  });
});
