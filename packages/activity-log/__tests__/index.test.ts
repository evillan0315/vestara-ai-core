import { describe, expect, it } from 'vitest';

describe('@vestara/activity-log', () => {
  it('exports ActivityLogStore', () => {
    const mod = require('../dist/index.js');
    expect(mod.ActivityLogStore).toBeDefined();
    expect(typeof mod.ActivityLogStore).toBe('function');
  });

  it('exports ActivityService', () => {
    const mod = require('../dist/index.js');
    expect(mod.ActivityService).toBeDefined();
    expect(typeof mod.ActivityService).toBe('function');
  });

  it('ActivityLogStore stores and retrieves events', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.ActivityLogStore();
    const event = {
      id: 'evt-1',
      timestamp: new Date().toISOString(),
      category: 'conversation' as const,
      type: 'conversation.started' as const,
      actor: { id: 'user-1', name: 'Test User', type: 'user' as const },
      resource: { type: 'conversation', id: 'conv-1', name: 'Test Conversation' },
      message: 'Test event',
      metadata: { key: 'value' },
    };
    await store.append(event);
    const events = await store.query({ limit: 10 });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].id).toBe('evt-1');
    expect(events[0].actor.name).toBe('Test User');
    expect(events[0].metadata).toEqual({ key: 'value' });
  });

  it('ActivityLogStore queries by category', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.ActivityLogStore();
    await store.append({
      id: 'evt-cat-1',
      timestamp: new Date().toISOString(),
      category: 'workspace' as const,
      type: 'workspace.opened' as const,
      actor: { id: 'sys', name: 'System', type: 'system' as const },
      resource: { type: 'repository', id: 'repo-1', name: 'My Repo' },
      message: 'Workspace opened',
      metadata: {},
    });
    const workspaceEvents = await store.query({ category: 'workspace' });
    expect(workspaceEvents.length).toBeGreaterThanOrEqual(1);
    expect(workspaceEvents[0].category).toBe('workspace');

    const convEvents = await store.query({ category: 'conversation' });
    expect(convEvents.length).toBe(0);
  });

  it('ActivityLogStore counts events', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.ActivityLogStore();
    const count = await store.count();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('ActivityLogStore deletes old events', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.ActivityLogStore();
    const oldDate = new Date('2020-01-01').toISOString();
    await store.append({
      id: 'evt-old',
      timestamp: oldDate,
      category: 'system' as const,
      type: 'system.heartbeat' as const,
      actor: { id: 'sys', name: 'System', type: 'system' as const },
      resource: { type: 'system', id: 'kernel', name: 'Kernel' },
      message: 'Old heartbeat',
      metadata: {},
    });
    await store.deleteBefore(new Date().toISOString());
    const oldEvents = await store.query({ type: 'system.heartbeat' });
    expect(oldEvents.length).toBe(0);
  });
});
