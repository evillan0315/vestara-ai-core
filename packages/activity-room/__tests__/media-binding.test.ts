/**
 * @vestara/activity-room — Media Binding Tests
 *
 * Comprehensive test suite for OVR-005: Activity Media Binding.
 * Uses fake MediaServer implementations — no VidUK dependency.
 *
 * Test Coverage:
 *   1. Binding creation, lookup, lifecycle
 *   2. Idempotency + one-active-binding invariant
 *   3. Participant authorization (authoritative resolution, NOT caller-supplied)
 *   4. Concurrent requestMedia() safety (single-flight)
 *   5. Failed-close semantics (creation-failed vs closure-failed)
 *   6. Replacement blocking on closure failure
 *   7. Activity Room isolation
 *   8. Credential non-persistence
 *   9. Provider-neutral serialization
 */

import type {
  CreateMediaConnectionOptions,
  CreateMediaConnectionResult,
  CreateMediaSessionOptions,
  MediaConnection,
  MediaParticipantCapabilities,
  MediaProviderCapabilities,
  MediaServer,
  MediaSession,
} from '@vestara/media-runtime';
import { createMediaConnectionCredential, MediaCapabilities } from '@vestara/media-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityMediaBindingService,
  BindingClosureFailedError,
  BindingCreationFailedError,
  BindingNotFoundError,
  ParticipantUnauthorizedError,
  ReplacementBlockedError,
} from '../src/media-binding-service';
import type { ActivityMediaBindingStore } from '../src/media-binding-store';
import { InMemoryActivityMediaBindingStore } from '../src/media-binding-store';
import type {
  ActivityMediaBinding,
  ActivityMediaBindingId,
  MediaParticipantType,
  ParticipantResolver,
  ResolvedParticipant,
} from '../src/media-binding-types';
import { generateBindingId } from '../src/media-binding-types';

// ─── Fake MediaServer ─────────────────────────────────────────

interface FakeMediaServerConfig {
  createSessionError?: Error;
  closeSessionError?: Error;
  createConnectionError?: Error;
  closeConnectionError?: Error;
  calls: string[];
}

function createFakeMediaServer(config: FakeMediaServerConfig = { calls: [] }): MediaServer {
  let sessionCounter = 0;
  let connectionCounter = 0;

  return {
    provider: 'fake-provider',
    version: '0.0.1-test',

    getCapabilities(): MediaProviderCapabilities {
      return {
        supportsSimulcast: false,
        supportsRecording: false,
        supportsScreenShare: false,
        maxParticipants: 100,
        supportedCodecs: ['vp8', 'opus'],
      };
    },

    async healthCheck(): Promise<boolean> {
      config.calls.push('healthCheck');
      return true;
    },

    async createSession(options?: CreateMediaSessionOptions): Promise<MediaSession> {
      config.calls.push(`createSession:${options?.id ?? 'auto'}`);
      if (config.createSessionError) {
        throw config.createSessionError;
      }
      sessionCounter++;
      const id = options?.id ?? `ms-fake-${sessionCounter}`;
      const now = Date.now();
      return {
        id,
        provider: 'fake-provider',
        status: 'active',
        customId: !!options?.id,
        createdAt: now,
        updatedAt: now,
      };
    },

    async closeSession(sessionId: string): Promise<void> {
      config.calls.push(`closeSession:${sessionId}`);
      if (config.closeSessionError) {
        throw config.closeSessionError;
      }
    },

    async getSession(_sessionId: string): Promise<MediaSession | undefined> {
      return undefined;
    },

    async listSessions(): Promise<ReadonlyArray<MediaSession>> {
      return [];
    },

    async createConnection(
      sessionId: string,
      options: CreateMediaConnectionOptions,
    ): Promise<CreateMediaConnectionResult> {
      config.calls.push(
        `createConnection:${sessionId}:${options.capabilities.publishAudio}:${options.capabilities.subscribe}`,
      );
      if (config.createConnectionError) {
        throw config.createConnectionError;
      }
      connectionCounter++;
      const id = options.id ?? `conn-fake-${connectionCounter}`;
      const now = Date.now();
      const connection: MediaConnection = {
        id,
        sessionId,
        status: 'active',
        capabilities: options.capabilities,
        customId: !!options.id,
        createdAt: now,
        updatedAt: now,
      };
      const credential = createMediaConnectionCredential({
        value: `fake-token-${connectionCounter}`,
        sessionId,
        connectionId: id,
        provider: 'fake-provider',
        expiresAt: now + 3600_000,
      });
      return { connection, credential };
    },

    async closeConnection(_connectionId: string, _reason?: string): Promise<void> {
      if (config.closeConnectionError) {
        throw config.closeConnectionError;
      }
    },

    async getConnection(_connectionId: string): Promise<MediaConnection | undefined> {
      return undefined;
    },

    async listConnections(_sessionId: string): Promise<ReadonlyArray<MediaConnection>> {
      return [];
    },
  } satisfies MediaServer;
}

// ─── Fake ParticipantResolver ─────────────────────────────────

function createFakeResolver(overrides?: Partial<Record<string, ResolvedParticipant>>): ParticipantResolver {
  const knownParticipants = new Map<string, ResolvedParticipant>([
    // Default known participants
    [
      'human-local',
      {
        participantId: 'human-local',
        participantType: 'human',
        authorized: true,
        canModerate: true, // Explicitly authorized moderator
      },
    ],
    [
      'agent-developer',
      {
        participantId: 'agent-developer',
        participantType: 'agent',
        authorized: true,
        canModerate: false,
      },
    ],
    [
      'system-bridge',
      {
        participantId: 'system-bridge',
        participantType: 'system',
        authorized: true,
        canModerate: false,
      },
    ],
    // Unauthorized participant
    [
      'attacker',
      {
        participantId: 'attacker',
        participantType: 'human',
        authorized: false,
        canModerate: false,
        rejectionReason: 'participant not in any team for this room',
      },
    ],
    // Override entries
    ...(overrides ? Object.entries(overrides).map(([k, v]) => [k, v!] as const) : []),
  ]);

  return {
    async resolve(_activityRoomId: string, participantId: string): Promise<ResolvedParticipant> {
      const found = knownParticipants.get(participantId);
      if (found) return found;

      // Unknown participant — reject
      return {
        participantId,
        participantType: 'human', // default type, but authorized=false
        authorized: false,
        canModerate: false,
        rejectionReason: 'unknown participant',
      };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function makeBindingId(): ActivityMediaBindingId {
  return generateBindingId();
}

// ─── Tests ────────────────────────────────────────────────────

describe('InMemoryActivityMediaBindingStore', () => {
  let store: ActivityMediaBindingStore;

  beforeEach(() => {
    store = new InMemoryActivityMediaBindingStore();
  });

  describe('binding creation', () => {
    it('creates and retrieves a binding', () => {
      const now = Date.now();
      const binding: ActivityMediaBinding = {
        id: 'amb-test-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'binding',
        createdAt: now,
        updatedAt: now,
      };
      store.create(binding);
      expect(store.get('amb-test-1' as ActivityMediaBindingId)).toEqual(binding);
    });

    it('rejects duplicate binding IDs', () => {
      const now = Date.now();
      const binding: ActivityMediaBinding = {
        id: 'amb-dup-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'binding',
        createdAt: now,
        updatedAt: now,
      };
      store.create(binding);
      expect(() => store.create({ ...binding })).toThrow('Binding already exists');
    });

    it('returns immutable clone on get', () => {
      const now = Date.now();
      store.create({
        id: 'amb-clone-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'binding',
        createdAt: now,
        updatedAt: now,
      });
      const retrieved = store.get('amb-clone-1' as ActivityMediaBindingId)!;
      (retrieved as any).status = 'closed';
      expect(store.get('amb-clone-1' as ActivityMediaBindingId)!.status).toBe('binding');
    });
  });

  describe('binding lookup', () => {
    it('finds active binding for ActivityRoom', () => {
      const now = Date.now();
      store.create({
        id: 'amb-active-1' as ActivityMediaBindingId,
        activityRoomId: 'room-lookup',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      expect(store.getActive('room-lookup')?.id).toBe('amb-active-1');
    });

    it('returns undefined when no active binding exists', () => {
      expect(store.getActive('room-empty')).toBeUndefined();
    });

    it('does not return closed/failed bindings as active', () => {
      const now = Date.now();
      store.create({
        id: 'amb-closed-1' as ActivityMediaBindingId,
        activityRoomId: 'room-closed',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'closed',
        createdAt: now,
        updatedAt: now,
      });
      store.create({
        id: 'amb-cf-1' as ActivityMediaBindingId,
        activityRoomId: 'room-closed',
        mediaSessionId: 'ms-2',
        provider: 'fake-provider',
        status: 'closure-failed',
        createdAt: now,
        updatedAt: now,
      });
      expect(store.getActive('room-closed')).toBeUndefined();
    });

    it('finds binding by MediaSession ID', () => {
      const now = Date.now();
      store.create({
        id: 'amb-ms-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-lookup-1',
        provider: 'fake-provider',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      expect(store.getByMediaSession('ms-lookup-1')?.id).toBe('amb-ms-1');
      expect(store.getByMediaSession('ms-missing')).toBeUndefined();
    });

    it('finds latest binding for ActivityRoom', () => {
      store.create({
        id: 'amb-old-1' as ActivityMediaBindingId,
        activityRoomId: 'room-latest',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'closed',
        createdAt: 1000,
        updatedAt: 1000,
      });
      store.create({
        id: 'amb-new-1' as ActivityMediaBindingId,
        activityRoomId: 'room-latest',
        mediaSessionId: 'ms-2',
        provider: 'fake-provider',
        status: 'active',
        createdAt: 2000,
        updatedAt: 2000,
      });
      expect(store.getLatest('room-latest')?.id).toBe('amb-new-1');
    });
  });

  describe('status updates', () => {
    it('transitions binding status', () => {
      const now = Date.now();
      store.create({
        id: 'amb-trans-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'binding',
        createdAt: now,
        updatedAt: now,
      });
      store.updateStatus('amb-trans-1' as ActivityMediaBindingId, 'active');
      expect(store.get('amb-trans-1' as ActivityMediaBindingId)!.status).toBe('active');
      store.updateStatus('amb-trans-1' as ActivityMediaBindingId, 'closing');
      expect(store.get('amb-trans-1' as ActivityMediaBindingId)!.status).toBe('closing');
      store.updateStatus('amb-trans-1' as ActivityMediaBindingId, 'closed');
      expect(store.get('amb-trans-1' as ActivityMediaBindingId)!.status).toBe('closed');
    });

    it('supports creation-failed status', () => {
      const now = Date.now();
      store.create({
        id: 'amb-cf-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'binding',
        createdAt: now,
        updatedAt: now,
      });
      store.updateStatus('amb-cf-1' as ActivityMediaBindingId, 'creation-failed', 'session limit reached');
      const b = store.get('amb-cf-1' as ActivityMediaBindingId)!;
      expect(b.status).toBe('creation-failed');
      expect(b.failureReason).toBe('session limit reached');
    });

    it('supports closure-failed status', () => {
      const now = Date.now();
      store.create({
        id: 'amb-clf-1' as ActivityMediaBindingId,
        activityRoomId: 'room-1',
        mediaSessionId: 'ms-1',
        provider: 'fake-provider',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      store.updateStatus('amb-clf-1' as ActivityMediaBindingId, 'closure-failed', 'provider timeout');
      const b = store.get('amb-clf-1' as ActivityMediaBindingId)!;
      expect(b.status).toBe('closure-failed');
      expect(b.failureReason).toBe('provider timeout');
    });
  });
});

describe('ActivityMediaBindingService', () => {
  let store: ActivityMediaBindingStore;
  let service: ActivityMediaBindingService;
  let server: MediaServer;
  let calls: string[];

  beforeEach(() => {
    store = new InMemoryActivityMediaBindingStore();
    service = new ActivityMediaBindingService({
      store,
      defaultProvider: 'fake-provider',
      participantResolver: createFakeResolver(),
    });
    calls = [];
    server = createFakeMediaServer({ calls });
  });

  // ─── 1. Binding creation and lifecycle ──────────────────────

  describe('binding creation', () => {
    it('creates a binding via MediaServer', async () => {
      const binding = await service.requestMedia('room-create', server);
      expect(binding.activityRoomId).toBe('room-create');
      expect(binding.status).toBe('active');
      expect(binding.provider).toBe('fake-provider');
      expect(binding.mediaSessionId).toBeTruthy();
      expect(calls).toContainEqual('createSession:auto');
    });

    it('binding ID follows amb- prefix convention', async () => {
      const binding = await service.requestMedia('room-prefix', server);
      expect(binding.id).toMatch(/^amb-\d+-[a-z0-9]+$/);
    });
  });

  // ─── 2. Idempotency ────────────────────────────────────────

  describe('idempotency', () => {
    it('returns existing binding on duplicate requestMedia', async () => {
      const first = await service.requestMedia('room-idem', server);
      const second = await service.requestMedia('room-idem', server);
      expect(first.id).toBe(second.id);
      expect(calls.filter((c) => c.startsWith('createSession')).length).toBe(1);
    });

    it('does not create multiple sessions for same ActivityRoom', async () => {
      await service.requestMedia('room-single', server);
      await service.requestMedia('room-single', server);
      await service.requestMedia('room-single', server);
      expect(calls.filter((c) => c.startsWith('createSession')).length).toBe(1);
    });
  });

  // ─── 3. Concurrent requestMedia() safety ────────────────────

  describe('concurrent requestMedia()', () => {
    it('single-flight: concurrent calls produce exactly one createSession', async () => {
      // Use a slow MediaServer to make the race window wider
      let sessionCounter = 0;
      const slowServer: MediaServer = {
        ...createFakeMediaServer({ calls }),
        async createSession(options?: CreateMediaSessionOptions): Promise<MediaSession> {
          calls.push(`createSession:${options?.id ?? 'auto'}`);
          // Simulate async delay
          await new Promise((r) => setTimeout(r, 50));
          sessionCounter++;
          const id = options?.id ?? `ms-slow-${sessionCounter}`;
          const now = Date.now();
          return {
            id,
            provider: 'fake-provider',
            status: 'active',
            customId: !!options?.id,
            createdAt: now,
            updatedAt: now,
          };
        },
      };

      const results = await Promise.all([
        service.requestMedia('room-concurrent', slowServer),
        service.requestMedia('room-concurrent', slowServer),
        service.requestMedia('room-concurrent', slowServer),
      ]);

      // All three should resolve to the same binding
      expect(results[0].id).toBe(results[1].id);
      expect(results[1].id).toBe(results[2].id);

      // Exactly one createSession call
      expect(calls.filter((c) => c.startsWith('createSession')).length).toBe(1);

      // Exactly one active binding
      const active = store.getActive('room-concurrent');
      expect(active).toBeDefined();
      expect(active!.id).toBe(results[0].id);
    });

    it('sequential duplicate request still works', async () => {
      const first = await service.requestMedia('room-seq', server);
      const second = await service.requestMedia('room-seq', server);
      expect(first.id).toBe(second.id);
      expect(calls.filter((c) => c.startsWith('createSession')).length).toBe(1);
    });
  });

  // ─── 4. Provider create failure ─────────────────────────────

  describe('provider create failure', () => {
    it('throws BindingCreationFailedError on MediaServer failure', async () => {
      const failingServer = createFakeMediaServer({
        calls,
        createSessionError: new Error('provider offline'),
      });

      await expect(service.requestMedia('room-fail-create', failingServer)).rejects.toThrow(BindingCreationFailedError);
      expect(store.getActive('room-fail-create')).toBeUndefined();
    });

    it('creation-failed allows retry (new session can be created)', async () => {
      // First call fails
      let failOnce = true;
      const flakyServer: MediaServer = {
        ...createFakeMediaServer({ calls }),
        async createSession(options?: CreateMediaSessionOptions): Promise<MediaSession> {
          if (failOnce) {
            failOnce = false;
            throw new Error('transient failure');
          }
          calls.push(`createSession:${options?.id ?? 'auto'}`);
          const now = Date.now();
          return {
            id: `ms-retry-${Date.now()}`,
            provider: 'fake-provider',
            status: 'active',
            customId: false,
            createdAt: now,
            updatedAt: now,
          };
        },
      };

      await expect(service.requestMedia('room-retry', flakyServer)).rejects.toThrow(BindingCreationFailedError);

      // Second call should succeed (no active binding blocks it)
      const binding = await service.requestMedia('room-retry', flakyServer);
      expect(binding.status).toBe('active');
    });
  });

  // ─── 5. Provider close success ──────────────────────────────

  describe('provider close success', () => {
    it('transitions binding through closing → closed', async () => {
      const created = await service.requestMedia('room-close-ok', server);
      await service.closeMedia('room-close-ok', server);

      expect(store.getActive('room-close-ok')).toBeUndefined();
      const latest = store.getLatest('room-close-ok');
      expect(latest?.status).toBe('closed');
      expect(latest?.closedAt).toBeGreaterThan(0);
      expect(calls).toContain(`closeSession:${created.mediaSessionId}`);
    });
  });

  // ─── 6. Failed-close semantics ──────────────────────────────

  describe('failed-close semantics', () => {
    it('transitions binding to closure-failed on close error', async () => {
      const closeFailingServer = createFakeMediaServer({
        calls,
        closeSessionError: new Error('session not found'),
      });

      await service.requestMedia('room-close-fail', closeFailingServer);
      await expect(service.closeMedia('room-close-fail', closeFailingServer)).rejects.toThrow(
        BindingClosureFailedError,
      );

      const latest = store.getLatest('room-close-fail');
      expect(latest?.status).toBe('closure-failed');
      expect(latest?.failureReason).toContain('session not found');
    });

    it('closure-failed status distinguishes from creation-failed', async () => {
      // Test creation-failed
      const failServer = createFakeMediaServer({
        calls,
        createSessionError: new Error('creation error'),
      });
      await expect(service.requestMedia('room-cf', failServer)).rejects.toThrow(BindingCreationFailedError);
      // Note: no binding is stored on creation failure (before store.create)

      // Test closure-failed
      const closeFailServer = createFakeMediaServer({
        calls,
        closeSessionError: new Error('closure error'),
      });
      await service.requestMedia('room-clf', closeFailServer);
      await expect(service.closeMedia('room-clf', closeFailServer)).rejects.toThrow(BindingClosureFailedError);

      const latest = store.getLatest('room-clf');
      expect(latest?.status).toBe('closure-failed');
    });
  });

  // ─── 7. Replacement blocking on closure failure ─────────────

  describe('replacement blocking', () => {
    it('blocks replacement when latest binding has closure-failed status', async () => {
      const closeFailServer = createFakeMediaServer({
        calls,
        closeSessionError: new Error('provider timeout'),
      });

      await service.requestMedia('room-block', closeFailServer);
      await expect(service.closeMedia('room-block', closeFailServer)).rejects.toThrow(BindingClosureFailedError);

      // Replacement should be blocked
      await expect(service.replaceBinding('room-block', closeFailServer)).rejects.toThrow(ReplacementBlockedError);

      // Still only one binding (the closure-failed one)
      expect(store.listByActivityRoom('room-block').length).toBe(1);
    });

    it('allows replacement after creation failure (no provider session)', async () => {
      let failOnce = true;
      const flakyServer: MediaServer = {
        ...createFakeMediaServer({ calls }),
        async createSession(options?: CreateMediaSessionOptions): Promise<MediaSession> {
          if (failOnce) {
            failOnce = false;
            throw new Error('transient');
          }
          calls.push(`createSession:${options?.id ?? 'auto'}`);
          const now = Date.now();
          return {
            id: `ms-after-cf-${Date.now()}`,
            provider: 'fake-provider',
            status: 'active',
            customId: false,
            createdAt: now,
            updatedAt: now,
          };
        },
      };

      await expect(service.requestMedia('room-cf-replace', flakyServer)).rejects.toThrow(BindingCreationFailedError);

      // Replacement should work (no provider session exists)
      const binding = await service.replaceBinding('room-cf-replace', flakyServer);
      expect(binding.status).toBe('active');
    });

    it('allows replacement of closed bindings', async () => {
      const first = await service.requestMedia('room-closed-replace', server);
      await service.closeMedia('room-closed-replace', server);

      const second = await service.replaceBinding('room-closed-replace', server);
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('active');
    });
  });

  // ─── 8. Activity Room isolation ─────────────────────────────

  describe('Activity Room isolation', () => {
    it('bindings for different ActivityRooms are independent', async () => {
      const bindingA = await service.requestMedia('room-a', server);
      const bindingB = await service.requestMedia('room-b', server);
      expect(bindingA.id).not.toBe(bindingB.id);
      expect(service.getActiveBinding('room-a')?.id).toBe(bindingA.id);
      expect(service.getActiveBinding('room-b')?.id).toBe(bindingB.id);
    });

    it('closing one room does not affect another', async () => {
      await service.requestMedia('room-iso-a', server);
      await service.requestMedia('room-iso-b', server);
      await service.closeMedia('room-iso-a', server);
      expect(service.getActiveBinding('room-iso-a')).toBeUndefined();
      expect(service.getActiveBinding('room-iso-b')).toBeDefined();
    });
  });

  // ─── 9. Participant authorization ───────────────────────────

  describe('participant authorization', () => {
    it('resolves participant type from authoritative state, NOT caller', async () => {
      await service.requestMedia('room-auth', server);

      // joinParticipant does NOT accept participantType
      const result = await service.joinParticipant('room-auth', 'human-local', server);

      // Capabilities derived from resolver, not caller
      expect(result.capabilities.publishAudio).toBe(true);
      expect(result.capabilities.publishVideo).toBe(true);
      expect(result.capabilities.subscribe).toBe(true);
      expect(result.capabilities.moderate).toBe(true); // Explicitly authorized
    });

    it('rejects unauthorized participants', async () => {
      await service.requestMedia('room-reject', server);

      await expect(service.joinParticipant('room-reject', 'attacker', server)).rejects.toThrow(
        ParticipantUnauthorizedError,
      );
    });

    it('derives agent capabilities from authoritative state', async () => {
      await service.requestMedia('room-agent', server);

      const result = await service.joinParticipant('room-agent', 'agent-developer', server);

      expect(result.capabilities.publishAudio).toBe(false);
      expect(result.capabilities.publishVideo).toBe(false);
      expect(result.capabilities.subscribe).toBe(true);
      expect(result.capabilities.moderate).toBe(false);
    });

    it('rejects join without active binding', async () => {
      await expect(service.joinParticipant('room-no-binding', 'human-local', server)).rejects.toThrow(
        BindingNotFoundError,
      );
    });

    it('human without moderation authority gets moderate: false', async () => {
      const resolverNoModerate: ParticipantResolver = {
        async resolve(_room: string, participantId: string) {
          return {
            participantId,
            participantType: 'human',
            authorized: true,
            canModerate: false, // Not authorized to moderate
          };
        },
      };

      const noModService = new ActivityMediaBindingService({
        store,
        defaultProvider: 'fake-provider',
        participantResolver: resolverNoModerate,
      });

      await noModService.requestMedia('room-nomod', server);
      const result = await noModService.joinParticipant('room-nomod', 'human-nomod', server);

      expect(result.capabilities.moderate).toBe(false);
      expect(result.capabilities.publishAudio).toBe(true);
    });
  });

  // ─── 10. Credential non-persistence ─────────────────────────

  describe('credential non-persistence', () => {
    it('binding does not contain credential/token', async () => {
      const binding = await service.requestMedia('room-no-cred', server);
      expect((binding as any).credential).toBeUndefined();
      expect((binding as any).token).toBeUndefined();
      expect((binding as any).secret).toBeUndefined();
    });

    it('join result credential is ephemeral', async () => {
      await service.requestMedia('room-ephemeral', server);
      const result = await service.joinParticipant('room-ephemeral', 'human-local', server);
      expect(result.credential).toBeTruthy();
      expect(result.binding.credential).toBeUndefined();
    });

    it('binding does not contain MediaStream/MediaStreamTrack', async () => {
      const binding = await service.requestMedia('room-no-media', server);
      expect((binding as any).mediaStream).toBeUndefined();
      expect((binding as any).stream).toBeUndefined();
      expect((binding as any).tracks).toBeUndefined();
    });
  });

  // ─── 11. Provider-neutral serialization ─────────────────────

  describe('provider-neutral serialization', () => {
    it('binding serializes to plain JSON', async () => {
      const binding = await service.requestMedia('room-serialize', server);
      const json = JSON.parse(JSON.stringify(binding));
      expect(json.id).toBe(binding.id);
      expect(json.activityRoomId).toBe('room-serialize');
      expect(json.status).toBe('active');
      expect(json.provider).toBe('fake-provider');
    });

    it('serialized binding contains no OpenVidu types', async () => {
      const binding = await service.requestMedia('room-no-ov', server);
      const json = JSON.stringify(binding);
      expect(json).not.toContain('OpenVidu');
      expect(json).not.toContain('BasicAuth');
      expect(json).not.toContain('tok_');
      expect(json).not.toContain('wss://');
    });
  });

  // ─── 12. Capability mapping ─────────────────────────────────

  describe('capability mapping', () => {
    it('baseline human has moderate: false (must be authorized)', () => {
      const caps = service.mapCapabilities('human');
      expect(caps.publishAudio).toBe(true);
      expect(caps.publishVideo).toBe(true);
      expect(caps.subscribe).toBe(true);
      expect(caps.moderate).toBe(false); // Not automatic
    });

    it('baseline agent is subscriber only', () => {
      const caps = service.mapCapabilities('agent');
      expect(caps.publishAudio).toBe(false);
      expect(caps.subscribe).toBe(true);
      expect(caps.moderate).toBe(false);
    });

    it('baseline system is subscriber only', () => {
      const caps = service.mapCapabilities('system');
      expect(caps.publishAudio).toBe(false);
      expect(caps.subscribe).toBe(true);
      expect(caps.moderate).toBe(false);
    });
  });

  // ─── 13. Lifecycle transitions ──────────────────────────────

  describe('lifecycle transitions', () => {
    it('follows binding → active on successful creation', async () => {
      const binding = await service.requestMedia('room-lifecycle', server);
      expect(binding.status).toBe('active');
    });

    it('follows active → closing → closed on closeMedia', async () => {
      await service.requestMedia('room-close-lc', server);
      await service.closeMedia('room-close-lc', server);
      const latest = store.getLatest('room-close-lc');
      expect(latest?.status).toBe('closed');
    });

    it('follows active → closing → closure-failed on close error', async () => {
      const failServer = createFakeMediaServer({
        calls,
        closeSessionError: new Error('close failed'),
      });
      await service.requestMedia('room-fail-lc', failServer);
      await expect(service.closeMedia('room-fail-lc', failServer)).rejects.toThrow();
      const latest = store.getLatest('room-fail-lc');
      expect(latest?.status).toBe('closure-failed');
    });
  });
});

describe('generateBindingId', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateBindingId());
    }
    expect(ids.size).toBe(100);
  });

  it('follows amb- prefix convention', () => {
    const id = generateBindingId();
    expect(id).toMatch(/^amb-\d+-[a-z0-9]+$/);
  });
});
