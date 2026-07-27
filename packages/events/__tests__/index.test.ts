import { describe, expect, it } from 'vitest';

describe('@vestara/events', () => {
  describe('envelope', () => {
    it('creates an event envelope', () => {
      const mod = require('../dist/index.js');
      const event = mod.createEvent('runtime:started', 1, { runtimeId: 'rt-1', runtimeType: 'agent' }, 'test');
      expect(event.id).toMatch(/^evt-/);
      expect(event.type).toBe('runtime:started');
      expect(event.version).toBe(1);
      expect(event.source).toBe('test');
      expect(event.payload.runtimeId).toBe('rt-1');
      expect(event.severity).toBe('info');
    });

    it('accepts overrides', () => {
      const mod = require('../dist/index.js');
      const event = mod.createEvent(
        'job:submitted',
        1,
        { jobId: 'job-1', jobType: 'analyze', priority: 3, owner: 'rt-1', intentId: null },
        'test',
        { severity: 'debug', runtimeId: 'rt-1' },
      );
      expect(event.severity).toBe('debug');
      expect(event.runtimeId).toBe('rt-1');
    });

    it('generates correlationId automatically', () => {
      const mod = require('../dist/index.js');
      const event = mod.createEvent('runtime:started', 1, { runtimeId: 'rt-1', runtimeType: 'agent' }, 'test');
      expect(event.correlationId).toMatch(/^cor-/);
    });

    it('accepts explicit correlationId', () => {
      const mod = require('../dist/index.js');
      const event = mod.createEvent('runtime:started', 1, { runtimeId: 'rt-1', runtimeType: 'agent' }, 'test', {
        correlationId: 'cor-user-request-1',
      });
      expect(event.correlationId).toBe('cor-user-request-1');
    });

    it('accepts causationId for event chains', () => {
      const mod = require('../dist/index.js');
      const parent = mod.createEvent(
        'job:submitted',
        1,
        { jobId: 'job-1', jobType: 'analyze', priority: 3, owner: 'rt-1', intentId: null },
        'test',
      );
      const child = mod.createEvent(
        'job:started',
        1,
        { jobId: 'job-1', workerId: 'w-1', startedAt: new Date().toISOString() },
        'test',
        { causationId: parent.id, correlationId: parent.correlationId },
      );
      expect(child.causationId).toBe(parent.id);
      expect(child.correlationId).toBe(parent.correlationId);
    });

    it('causationId defaults to null', () => {
      const mod = require('../dist/index.js');
      const event = mod.createEvent('runtime:started', 1, { runtimeId: 'rt-1', runtimeType: 'agent' }, 'test');
      expect(event.causationId).toBeNull();
    });
  });

  describe('runtime event catalog', () => {
    it('exports runtime event type constants', () => {
      const mod = require('../dist/index.js');
      expect(mod.RuntimeEventTypes.Created).toBe('runtime:created');
      expect(mod.RuntimeEventTypes.Started).toBe('runtime:started');
      expect(mod.RuntimeEventTypes.Failed).toBe('runtime:failed');
      expect(mod.RuntimeEventTypes.Destroyed).toBe('runtime:destroyed');
    });

    it('creates typed runtime events from catalog', () => {
      const mod = require('../dist/index.js');
      const event = mod.createEvent(
        mod.RuntimeEventTypes.Started,
        1,
        {
          runtimeId: 'rt-1',
          runtimeType: 'agent',
          health: {
            status: 'healthy',
            serviceId: 'rt-1',
            version: '1',
            uptime: 0,
            lastHealthCheck: new Date().toISOString(),
            dependencies: [],
          },
        },
        'test',
      );
      expect(event.type).toBe('runtime:started');
      expect(event.payload.runtimeId).toBe('rt-1');
      expect(event.payload.health.status).toBe('healthy');
    });
  });

  describe('job event catalog', () => {
    it('exports job event type constants', () => {
      const mod = require('../dist/index.js');
      expect(mod.JobEventTypes.Submitted).toBe('job:submitted');
      expect(mod.JobEventTypes.Completed).toBe('job:completed');
      expect(mod.JobEventTypes.Failed).toBe('job:failed');
      expect(mod.JobEventTypes.Archived).toBe('job:archived');
    });
  });

  describe('worker event catalog', () => {
    it('exports worker event type constants', () => {
      const mod = require('../dist/index.js');
      expect(mod.WorkerEventTypes.Registered).toBe('worker:registered');
      expect(mod.WorkerEventTypes.TrustChanged).toBe('worker:trust-changed');
    });
  });

  describe('verification event catalog', () => {
    it('exports verification event type constants', () => {
      const mod = require('../dist/index.js');
      expect(mod.VerificationEventTypes.Passed).toBe('verification:passed');
      expect(mod.VerificationEventTypes.Failed).toBe('verification:failed');
    });
  });

  describe('recovery event catalog', () => {
    it('exports recovery event type constants', () => {
      const mod = require('../dist/index.js');
      expect(mod.RecoveryEventTypes.Triggered).toBe('recovery:triggered');
      expect(mod.RecoveryEventTypes.Exhausted).toBe('recovery:exhausted');
    });
  });

  describe('system event catalog', () => {
    it('exports system event type constants', () => {
      const mod = require('../dist/index.js');
      expect(mod.SystemEventTypes.BootStarting).toBe('system:boot-starting');
      expect(mod.SystemEventTypes.BootComplete).toBe('system:boot-complete');
    });
  });

  describe('backward compatibility', () => {
    it('still exports the legacy API surface', () => {
      const mod = require('../dist/index.js');
      expect(mod.WORKSPACE_EVENT_CHANNELS).toBeDefined();
      expect(mod.DOMAIN_EVENT_CATEGORIES).toBeDefined();
      expect(typeof mod.categorizeEvent).toBe('function');
    });

    it('still exports categorizeEvent', () => {
      const mod = require('../dist/index.js');
      expect(mod.categorizeEvent('conversation.started')).toBe('conversation');
      expect(mod.categorizeEvent('unknown')).toBe('system');
    });

    it('still exports WORKSPACE_EVENT_CHANNELS', () => {
      const mod = require('../dist/index.js');
      expect(mod.WORKSPACE_EVENT_CHANNELS).toContain('workspace');
      expect(mod.WORKSPACE_EVENT_CHANNELS).toContain('activity');
    });
  });

  describe('EventBus interface', () => {
    it('exports EventBus interface shape', () => {
      const mod = require('../dist/index.js');
      expect(mod.EventBus).toBeUndefined();
      expect(typeof mod).toBe('object');
    });

    it('exports EventHandler type', () => {
      const mod = require('../dist/index.js');
      expect(mod).toBeDefined();
    });
  });
});
