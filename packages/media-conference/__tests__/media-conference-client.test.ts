/**
 * @vestara/media-conference — MediaConferenceClient Tests
 *
 * Deterministic tests for the browser-side media conference client.
 * Uses a mock BrowserAdapter — no live server required.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaConferenceClient } from '../src/media-conference-client';
import type {
  BrowserAdapter,
  BrowserAdapterEvents,
  MediaConferenceContext,
  PublisherHandle,
  SubscriberHandle,
} from '../src/types';

// ─── Mock BrowserAdapter ─────────────────────────────────────

class MockPublisherHandle implements PublisherHandle {
  mediaStream: MediaStream | null;
  publishVideo = vi.fn();
  publishAudio = vi.fn();
  destroy = vi.fn();

  constructor(ms: MediaStream | null = null) {
    this.mediaStream = ms;
  }
}

class MockSubscriberHandle implements SubscriberHandle {
  constructor(
    public readonly streamId: string,
    public readonly connectionId: string,
    public readonly displayName: string,
    public readonly audioActive: boolean,
    public readonly videoActive: boolean,
    public readonly mediaStream: MediaStream | null = null,
  ) {}

  destroy = vi.fn();
}

class MockBrowserAdapter implements BrowserAdapter {
  private events: BrowserAdapterEvents = {};
  private connected = false;

  connect = vi.fn().mockImplementation(async () => {
    this.connected = true;
  });

  disconnect = vi.fn().mockImplementation(() => {
    this.connected = false;
  });

  publish = vi.fn().mockImplementation(async () => {
    return new MockPublisherHandle();
  });

  unpublish = vi.fn();

  subscribe = vi.fn();

  unsubscribe = vi.fn();

  on(events: BrowserAdapterEvents): void {
    this.events = { ...this.events, ...events };
  }

  destroy = vi.fn();

  // Test helpers
  emitRemoteStreamCreated(subscriber: MockSubscriberHandle): void {
    this.events.onRemoteStreamCreated?.(subscriber);
  }

  emitRemoteStreamDestroyed(streamId: string, connectionId: string): void {
    this.events.onRemoteStreamDestroyed?.(streamId, connectionId);
  }

  emitSessionDisconnected(): void {
    this.events.onSessionDisconnected?.();
  }

  emitError(message: string): void {
    this.events.onError?.(message);
  }
}

// ─── Context Factory ─────────────────────────────────────────

function createContext(overrides?: Partial<MediaConferenceContext>): MediaConferenceContext {
  return {
    serverUrl: 'https://fake-server.com',
    sessionId: 'test-session',
    credential: 'fake-token',
    displayName: 'Test User',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('MediaConferenceClient', () => {
  let client: MediaConferenceClient;
  let adapter: MockBrowserAdapter;

  beforeEach(() => {
    client = new MediaConferenceClient();
    adapter = new MockBrowserAdapter();
  });

  afterEach(() => {
    client.destroy();
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(client.getState().state).toBe('idle');
    });

    it('has no participants', () => {
      expect(client.getState().participants).toEqual([]);
    });

    it('camera and microphone are off', () => {
      expect(client.getState().cameraEnabled).toBe(false);
      expect(client.getState().microphoneEnabled).toBe(false);
    });

    it('has no error', () => {
      expect(client.getState().error).toBeNull();
    });
  });

  describe('credential non-persistence', () => {
    it('does not store credential in state', () => {
      const state = client.getState();
      expect(JSON.stringify(state)).not.toContain('fake-token');
      expect(JSON.stringify(state)).not.toContain('credential');
    });

    it('discards context after connect', async () => {
      await client.connect(createContext(), () => adapter);

      const stateStr = JSON.stringify(client.getState());
      expect(stateStr).not.toContain('fake-token');
      expect(stateStr).not.toContain('credential');
      expect(stateStr).not.toContain('serverUrl');
    });
  });

  describe('provider-neutral serialization', () => {
    it('state contains no provider types', async () => {
      await client.connect(createContext(), () => adapter);

      const stateStr = JSON.stringify(client.getState());
      expect(stateStr).not.toContain('OpenVidu');
      expect(stateStr).not.toContain('Publisher');
      expect(stateStr).not.toContain('Subscriber');
      expect(stateStr).not.toContain('Session');
    });

    it('state contains no credentials', async () => {
      await client.connect(createContext(), () => adapter);

      const stateStr = JSON.stringify(client.getState());
      expect(stateStr).not.toContain('fake-token');
      expect(stateStr).not.toContain('credential');
      expect(stateStr).not.toContain('token');
      expect(stateStr).not.toContain('secret');
    });

    it('participant does not contain MediaStream in serialized state', async () => {
      await client.connect(createContext(), () => adapter);

      const state = client.getState();
      const serialized = JSON.parse(JSON.stringify(state));

      for (const p of serialized.participants) {
        expect(p.mediaStream).toBeNull();
      }
    });
  });

  describe('connect lifecycle', () => {
    it('transitions idle → connecting → connected', async () => {
      const stateChanges: string[] = [];
      client.on({
        onStateChange: (state) => stateChanges.push(state),
      });

      await client.connect(createContext(), () => adapter);

      expect(stateChanges).toContain('connecting');
      expect(stateChanges).toContain('connected');
      expect(client.getState().state).toBe('connected');
    });

    it('creates local participant on connect', async () => {
      await client.connect(createContext(), () => adapter);

      const state = client.getState();
      expect(state.participants.length).toBe(1);
      expect(state.localParticipant).not.toBeNull();
      expect(state.localParticipant?.local).toBe(true);
      expect(state.localParticipant?.displayName).toBe('Test User');
    });

    it('sets camera and microphone on by default', async () => {
      await client.connect(createContext(), () => adapter);

      const state = client.getState();
      expect(state.cameraEnabled).toBe(true);
      expect(state.microphoneEnabled).toBe(true);
    });

    it('credential is consumed (passed to adapter connect)', async () => {
      await client.connect(createContext(), () => adapter);

      expect(adapter.connect).toHaveBeenCalledWith('https://fake-server.com', 'fake-token');
    });

    it('calls adapter publish', async () => {
      await client.connect(createContext(), () => adapter);

      expect(adapter.publish).toHaveBeenCalledWith({
        publishAudio: true,
        publishVideo: true,
      });
    });

    it('respects publishAudio: false', async () => {
      await client.connect(createContext({ publishAudio: false }), () => adapter);

      expect(adapter.publish).toHaveBeenCalledWith({
        publishAudio: false,
        publishVideo: true,
      });

      expect(client.getState().microphoneEnabled).toBe(false);
    });

    it('respects publishVideo: false', async () => {
      await client.connect(createContext({ publishVideo: false }), () => adapter);

      expect(adapter.publish).toHaveBeenCalledWith({
        publishAudio: true,
        publishVideo: false,
      });

      expect(client.getState().cameraEnabled).toBe(false);
    });

    it('cannot connect while connecting', async () => {
      const slowAdapter = new MockBrowserAdapter();
      slowAdapter.connect.mockImplementation(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));

      const connectPromise = client.connect(createContext(), () => slowAdapter);

      await expect(client.connect(createContext(), () => slowAdapter)).rejects.toThrow(
        'Cannot connect in state: connecting',
      );

      // Cleanup
      await connectPromise;
    });
  });

  describe('disconnect lifecycle', () => {
    it('transitions connected → disconnected', async () => {
      await client.connect(createContext(), () => adapter);

      const stateChanges: string[] = [];
      client.on({
        onStateChange: (state) => stateChanges.push(state),
      });

      await client.disconnect();

      expect(stateChanges).toContain('disconnected');
      expect(client.getState().state).toBe('disconnected');
    });

    it('clears participants on disconnect', async () => {
      await client.connect(createContext(), () => adapter);
      await client.disconnect();

      expect(client.getState().participants).toEqual([]);
    });

    it('calls adapter disconnect and destroy', async () => {
      await client.connect(createContext(), () => adapter);
      await client.disconnect();

      expect(adapter.disconnect).toHaveBeenCalled();
      expect(adapter.destroy).toHaveBeenCalled();
    });

    it('no-op when already disconnected', async () => {
      await client.connect(createContext(), () => adapter);
      await client.disconnect();

      const stateChanges: string[] = [];
      client.on({
        onStateChange: (state) => stateChanges.push(state),
      });

      await client.disconnect();
      expect(stateChanges).toEqual([]);
    });

    it('no-op when idle', async () => {
      const stateChanges: string[] = [];
      client.on({
        onStateChange: (state) => stateChanges.push(state),
      });

      await client.disconnect();
      expect(stateChanges).toEqual([]);
    });

    it('cleanup on destroy', async () => {
      await client.connect(createContext(), () => adapter);
      client.destroy();

      expect(adapter.disconnect).toHaveBeenCalled();
      expect(adapter.destroy).toHaveBeenCalled();
    });
  });

  describe('camera toggle', () => {
    it('toggles camera state', async () => {
      await client.connect(createContext(), () => adapter);

      expect(client.getState().cameraEnabled).toBe(true);

      const newState = await client.toggleCamera();
      expect(newState).toBe(false);
      expect(client.getState().cameraEnabled).toBe(false);

      const newState2 = await client.toggleCamera();
      expect(newState2).toBe(true);
      expect(client.getState().cameraEnabled).toBe(true);
    });

    it('calls publisher.publishVideo', async () => {
      const publisher = new MockPublisherHandle();
      adapter.publish.mockResolvedValue(publisher);

      await client.connect(createContext(), () => adapter);

      await client.toggleCamera();
      expect(publisher.publishVideo).toHaveBeenCalledWith(false);

      await client.toggleCamera();
      expect(publisher.publishVideo).toHaveBeenCalledWith(true);
    });

    it('does not modify connection state', async () => {
      await client.connect(createContext(), () => adapter);

      const stateBefore = client.getState();
      await client.toggleCamera();
      const stateAfter = client.getState();

      expect(stateAfter.state).toBe(stateBefore.state);
      expect(stateAfter.participants.length).toBe(stateBefore.participants.length);
    });

    it('returns current state when no publisher', async () => {
      const result = await client.toggleCamera();
      expect(result).toBe(false);
    });
  });

  describe('microphone toggle', () => {
    it('toggles microphone state', async () => {
      await client.connect(createContext(), () => adapter);

      expect(client.getState().microphoneEnabled).toBe(true);

      const newState = await client.toggleMicrophone();
      expect(newState).toBe(false);
      expect(client.getState().microphoneEnabled).toBe(false);
    });

    it('calls publisher.publishAudio', async () => {
      const publisher = new MockPublisherHandle();
      adapter.publish.mockResolvedValue(publisher);

      await client.connect(createContext(), () => adapter);

      await client.toggleMicrophone();
      expect(publisher.publishAudio).toHaveBeenCalledWith(false);
    });

    it('does not modify connection state', async () => {
      await client.connect(createContext(), () => adapter);

      const stateBefore = client.getState();
      await client.toggleMicrophone();
      const stateAfter = client.getState();

      expect(stateAfter.state).toBe(stateBefore.state);
      expect(stateAfter.participants.length).toBe(stateBefore.participants.length);
    });
  });

  describe('remote participant lifecycle', () => {
    it('adds remote participant on stream created', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('remote-stream-1', 'remote-conn-1', 'Remote User', true, true);

      adapter.emitRemoteStreamCreated(subscriber);

      const state = client.getState();
      expect(state.participants.length).toBe(2);
      expect(state.remoteParticipants.length).toBe(1);
      expect(state.remoteParticipants[0].displayName).toBe('Remote User');
      expect(state.remoteParticipants[0].id).toBe('remote-conn-1');
    });

    it('removes remote participant on stream destroyed', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('remote-stream-1', 'remote-conn-1', 'Remote User', true, true);

      adapter.emitRemoteStreamCreated(subscriber);
      expect(client.getState().remoteParticipants.length).toBe(1);

      adapter.emitRemoteStreamDestroyed('remote-stream-1', 'remote-conn-1');
      expect(client.getState().remoteParticipants.length).toBe(0);
    });

    it('preserves local participant when remote leaves', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('remote-stream-1', 'remote-conn-1', 'Remote User', true, true);

      adapter.emitRemoteStreamCreated(subscriber);
      adapter.emitRemoteStreamDestroyed('remote-stream-1', 'remote-conn-1');

      const state = client.getState();
      expect(state.participants.length).toBe(1);
      expect(state.localParticipant).not.toBeNull();
      expect(state.localParticipant?.local).toBe(true);
    });

    it('handles audio-only remote participant', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('audio-stream', 'audio-conn', 'Audio Only', true, false);

      adapter.emitRemoteStreamCreated(subscriber);

      const remote = client.getState().remoteParticipants[0];
      expect(remote.audioEnabled).toBe(true);
      expect(remote.videoEnabled).toBe(false);
    });

    it('handles video-only remote participant', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('video-stream', 'video-conn', 'Video Only', false, true);

      adapter.emitRemoteStreamCreated(subscriber);

      const remote = client.getState().remoteParticipants[0];
      expect(remote.audioEnabled).toBe(false);
      expect(remote.videoEnabled).toBe(true);
    });

    it('destroys subscriber handle on stream destroyed', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('remote-stream-1', 'remote-conn-1', 'Remote User', true, true);

      adapter.emitRemoteStreamCreated(subscriber);
      adapter.emitRemoteStreamDestroyed('remote-stream-1', 'remote-conn-1');

      expect(subscriber.destroy).toHaveBeenCalled();
    });
  });

  describe('connection failure', () => {
    it('transitions to failed state on connect error', async () => {
      const failingAdapter = new MockBrowserAdapter();
      failingAdapter.connect.mockRejectedValue(new Error('Connection refused'));

      const stateChanges: string[] = [];
      client.on({
        onStateChange: (state) => stateChanges.push(state),
      });

      await expect(client.connect(createContext(), () => failingAdapter)).rejects.toThrow('Connection refused');

      expect(stateChanges).toContain('failed');
      expect(client.getState().state).toBe('failed');
      expect(client.getState().error).toBe('Connection refused');
    });

    it('allows retry after failure', async () => {
      const failingAdapter: BrowserAdapter = {
        ...adapter,
        connect: vi.fn().mockRejectedValueOnce(new Error('Transient')),
      };

      await expect(client.connect(createContext(), () => failingAdapter)).rejects.toThrow();
      expect(client.getState().state).toBe('failed');

      // Reset — use working adapter
      await client.connect(createContext(), () => adapter);
      expect(client.getState().state).toBe('connected');
    });
  });

  describe('force disconnect', () => {
    it('handles session disconnected event', async () => {
      await client.connect(createContext(), () => adapter);

      adapter.emitSessionDisconnected();

      expect(client.getState().state).toBe('disconnected');
      expect(client.getState().participants).toEqual([]);
    });

    it('cleans up subscribers on session disconnected', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('remote-stream-1', 'remote-conn-1', 'Remote User', true, true);

      adapter.emitRemoteStreamCreated(subscriber);
      adapter.emitSessionDisconnected();

      expect(subscriber.destroy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('forwards adapter errors', async () => {
      await client.connect(createContext(), () => adapter);

      let receivedError: string | undefined;
      client.on({
        onError: (err) => {
          receivedError = err;
        },
      });

      adapter.emitError('Something went wrong');

      expect(receivedError).toBe('Something went wrong');
      expect(client.getState().error).toBe('Something went wrong');
    });
  });

  describe('destroy', () => {
    it('cleans up all resources', async () => {
      await client.connect(createContext(), () => adapter);

      const subscriber = new MockSubscriberHandle('remote-stream-1', 'remote-conn-1', 'Remote User', true, true);

      adapter.emitRemoteStreamCreated(subscriber);

      client.destroy();

      expect(adapter.disconnect).toHaveBeenCalled();
      expect(adapter.destroy).toHaveBeenCalled();
      expect(subscriber.destroy).toHaveBeenCalled();
    });
  });
});
