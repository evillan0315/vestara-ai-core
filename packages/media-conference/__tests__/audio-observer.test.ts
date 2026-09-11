/**
 * @vestara/media-conference — AudioObserver Tests
 *
 * Deterministic tests for the Web Audio-based audio observer.
 * Uses mock AudioContext/MediaStream — no live server required.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-007 Audio Observation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioObserver } from '../src/audio-observer';
import type { AudioFrame } from '../src/audio-observer-types';

// ─── Mocks ───────────────────────────────────────────────────

class MockAudioTrack {
  kind = 'audio';
  enabled = true;
  readyState = 'live';
  private listeners = new Map<string, Set<Function>>();

  addEventListener(type: string, handler: Function) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: Function) {
    this.listeners.get(type)?.delete(handler);
  }

  // Test helper: simulate track ended
  emitEnded() {
    this.listeners.get('ended')?.forEach((h) => h());
  }

  stop() {
    this.readyState = 'ended';
    this.emitEnded();
  }
}

class MockVideoTrack {
  kind = 'video';
  enabled = true;
  readyState = 'live';
  addEventListener() {}
  removeEventListener() {}
}

class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  private channelData: Float32Array[];

  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channelData = [];
    for (let i = 0; i < options.numberOfChannels; i++) {
      this.channelData.push(new Float32Array(options.length));
    }
  }

  getChannelData(channel: number): Float32Array {
    return this.channelData[channel];
  }

  // Test helper: fill channel with non-zero data
  fillChannel(channel: number, value: number) {
    this.channelData[channel].fill(value);
  }
}

class MockAudioProcessingEvent {
  inputBuffer: MockAudioBuffer;
  constructor(inputBuffer: MockAudioBuffer) {
    this.inputBuffer = inputBuffer;
  }
}

class MockScriptProcessorNode {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();

  // Test helper: trigger onaudioprocess
  triggerProcess(buffer: MockAudioBuffer) {
    if (this.onaudioprocess) {
      this.onaudioprocess(new MockAudioProcessingEvent(buffer) as any);
    }
  }
}

class MockMediaStreamAudioSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  currentTime = 0;
  destination = {};
  createMediaStreamSource = vi.fn().mockImplementation(() => new MockMediaStreamAudioSourceNode());
  createScriptProcessor = vi.fn().mockImplementation(() => new MockScriptProcessorNode());
  close = vi.fn().mockResolvedValue(undefined);
}

// Track the mock AudioContext for test access
let mockAudioContext: MockAudioContext;

// ─── Mock MediaStream ────────────────────────────────────────

function createMockMediaStream(options?: { audio?: boolean; video?: boolean }): MediaStream {
  const tracks: any[] = [];
  if (options?.audio !== false) tracks.push(new MockAudioTrack());
  if (options?.video) tracks.push(new MockVideoTrack());

  return {
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getTracks: () => tracks,
    id: `mock-stream-${Math.random().toString(36).slice(2)}`,
    active: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any;
}

// ─── Setup global mocks ─────────────────────────────────────

beforeEach(() => {
  mockAudioContext = new MockAudioContext();

  // Mock global AudioContext as a constructable class
  const ctx = mockAudioContext;
  (globalThis as any).AudioContext = class MockAudioContextCtor {
    currentTime = 0;
    destination = {};
    createMediaStreamSource = ctx.createMediaStreamSource;
    createScriptProcessor = ctx.createScriptProcessor;
    close = ctx.close;
  };
});

afterEach(() => {
  delete (globalThis as any).AudioContext;
});

// ─── Tests ───────────────────────────────────────────────────

describe('AudioObserver', () => {
  let observer: WebAudioObserver;

  beforeEach(() => {
    observer = new WebAudioObserver();
  });

  afterEach(() => {
    observer.destroy();
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(observer.state).toBe('idle');
    });
  });

  describe('attach', () => {
    it('transitions to observing when stream has audio', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      expect(observer.state).toBe('observing');
    });

    it('stays idle when stream has no audio track', () => {
      const stream = createMockMediaStream({ audio: false, video: true });
      observer.attach(stream, 'participant-1');
      expect(observer.state).toBe('idle');
    });

    it('creates AudioContext on attach', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
    });

    it('connects source to processor', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const processorNode = mockAudioContext.createScriptProcessor.mock.results[0].value;
      expect(sourceNode.connect).toHaveBeenCalledWith(processorNode);
    });
  });

  describe('detach', () => {
    it('transitions from observing to stopped', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      observer.detach();
      expect(observer.state).toBe('stopped');
    });

    it('is idempotent', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      observer.detach();
      observer.detach(); // no-op
      expect(observer.state).toBe('stopped');
    });

    it('no-op when idle', () => {
      observer.detach();
      expect(observer.state).toBe('idle');
    });

    it('disconnects nodes on detach', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');

      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[0].value;
      const processorNode = mockAudioContext.createScriptProcessor.mock.results[0].value;

      observer.detach();

      expect(sourceNode.disconnect).toHaveBeenCalled();
      expect(processorNode.disconnect).toHaveBeenCalled();
      expect(processorNode.onaudioprocess).toBeNull();
    });

    it('closes AudioContext on detach', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      observer.detach();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  describe('audio frame extraction', () => {
    it('invokes callback with non-zero audio frames', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');

      const frames: AudioFrame[] = [];
      observer.onFrame((frame) => frames.push(frame));

      // Simulate audio processing with non-zero data
      const processorNode = mockAudioContext.createScriptProcessor.mock.results[0].value;
      const buffer = new MockAudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 48000 });
      buffer.fillChannel(0, 0.5); // non-zero audio

      processorNode.triggerProcess(buffer as any);

      expect(frames.length).toBe(1);
      expect(frames[0].sourceId).toBe('participant-1');
      expect(frames[0].sampleRate).toBe(48000);
      expect(frames[0].channels).toBe(1);
      expect(frames[0].data[0]).toBe(0.5);
    });

    it('emits all frames including silent ones (VAD classifies downstream)', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');

      const frames: AudioFrame[] = [];
      observer.onFrame((frame) => frames.push(frame));

      // Simulate silent audio
      const processorNode = mockAudioContext.createScriptProcessor.mock.results[0].value;
      const buffer = new MockAudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 48000 });
      // buffer is all zeros — silent

      processorNode.triggerProcess(buffer as any);

      expect(frames.length).toBe(1);
      expect(frames[0].peak).toBe(0);
    });

    it('copies frame data to avoid reference retention', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');

      const frames: AudioFrame[] = [];
      observer.onFrame((frame) => frames.push(frame));

      const processorNode = mockAudioContext.createScriptProcessor.mock.results[0].value;
      const buffer = new MockAudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 48000 });
      buffer.fillChannel(0, 0.3);

      processorNode.triggerProcess(buffer as any);

      // Modify the original buffer
      buffer.fillChannel(0, 0.9);

      // Frame data should be unchanged (copied)
      expect(frames[0].data[0]).toBeCloseTo(0.3, 5);
    });
  });

  describe('lifecycle', () => {
    it('supports multiple attach/detach cycles', () => {
      const stream1 = createMockMediaStream({ audio: true });
      const stream2 = createMockMediaStream({ audio: true });

      observer.attach(stream1, 'p1');
      expect(observer.state).toBe('observing');

      observer.detach();
      expect(observer.state).toBe('stopped');

      observer.attach(stream2, 'p2');
      expect(observer.state).toBe('observing');

      observer.detach();
      expect(observer.state).toBe('stopped');
    });

    it('re-attach detaches from previous stream', () => {
      const stream1 = createMockMediaStream({ audio: true });
      const stream2 = createMockMediaStream({ audio: true });

      observer.attach(stream1, 'p1');
      observer.attach(stream2, 'p2'); // should auto-detach from stream1

      expect(observer.state).toBe('observing');
      expect(mockAudioContext.close).toHaveBeenCalledTimes(1); // from auto-detach
    });

    it('track ended auto-detaches', () => {
      const audioTrack = new MockAudioTrack();
      const stream = {
        getAudioTracks: () => [audioTrack],
        getVideoTracks: () => [],
        getTracks: () => [audioTrack],
        id: 'mock-stream',
        active: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as any;

      observer.attach(stream, 'participant-1');
      expect(observer.state).toBe('observing');

      // Simulate track ended
      audioTrack.stop();

      expect(observer.state).toBe('stopped');
    });
  });

  describe('destroy', () => {
    it('transitions to destroyed state', () => {
      observer.destroy();
      expect(observer.state).toBe('destroyed');
    });

    it('cannot attach after destroy', () => {
      observer.destroy();
      const stream = createMockMediaStream({ audio: true });
      expect(() => observer.attach(stream, 'p1')).toThrow('destroyed');
    });

    it('cleans up resources on destroy', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');
      observer.destroy();

      expect(mockAudioContext.close).toHaveBeenCalled();
      expect(observer.state).toBe('destroyed');
    });
  });

  describe('offFrame', () => {
    it('stops receiving frames after offFrame', () => {
      const stream = createMockMediaStream({ audio: true });
      observer.attach(stream, 'participant-1');

      const frames: AudioFrame[] = [];
      observer.onFrame((frame) => frames.push(frame));
      observer.offFrame();

      const processorNode = mockAudioContext.createScriptProcessor.mock.results[0].value;
      const buffer = new MockAudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 48000 });
      buffer.fillChannel(0, 0.5);

      processorNode.triggerProcess(buffer as any);

      expect(frames.length).toBe(0);
    });
  });

  describe('playback unaffected', () => {
    it('does not connect processor to audio destination', () => {
      // Verify the observer's implementation never connects processor to destination.
      // The WebAudioObserver.connect() source→processor is the only connection.
      // We verify by checking that no mock processor's connect was called with destination.
      const stream = createMockMediaStream({ audio: true });
      const beforeCount = mockAudioContext.createScriptProcessor.mock.results.length;
      observer.attach(stream, 'participant-1');

      const processorNode = mockAudioContext.createScriptProcessor.mock.results[beforeCount].value;

      // The sourceNode.connect(processorNode) call is on the source, not the processor.
      // The processor itself should not have connect() called with destination.
      const sourceNode = mockAudioContext.createMediaStreamSource.mock.results[beforeCount].value;

      // Source connects to processor (good) — verify this happened
      expect(sourceNode.connect).toHaveBeenCalledWith(processorNode);

      // Processor should NOT connect to destination
      // MockScriptProcessorNode has connect as a vi.fn() — check its calls
      expect(processorNode.connect).toBeDefined();
      const destCalls = processorNode.connect.mock.calls.filter(
        (call: any[]) => call[0] === (mockAudioContext as any).destination,
      );
      expect(destCalls.length).toBe(0);
    });
  });

  describe('multiple participants', () => {
    it('observes each participant independently', () => {
      const observer2 = new WebAudioObserver();

      const stream1 = createMockMediaStream({ audio: true });
      const stream2 = createMockMediaStream({ audio: true });

      // Track the mock results count before attaching
      const beforeCount = mockAudioContext.createScriptProcessor.mock.results.length;

      observer.attach(stream1, 'p1');
      observer2.attach(stream2, 'p2');

      const frames1: AudioFrame[] = [];
      const frames2: AudioFrame[] = [];

      observer.onFrame((f) => frames1.push(f));
      observer2.onFrame((f) => frames2.push(f));

      // Get the processor nodes for each observer
      const proc1 = mockAudioContext.createScriptProcessor.mock.results[beforeCount].value;
      const proc2 = mockAudioContext.createScriptProcessor.mock.results[beforeCount + 1].value;

      // Trigger audio on observer1
      const buf1 = new MockAudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 48000 });
      buf1.fillChannel(0, 0.5);
      proc1.triggerProcess(buf1 as any);

      // Trigger audio on observer2
      const buf2 = new MockAudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 48000 });
      buf2.fillChannel(0, 0.8);
      proc2.triggerProcess(buf2 as any);

      expect(frames1.length).toBe(1);
      expect(frames1[0].sourceId).toBe('p1');
      expect(frames1[0].data[0]).toBeCloseTo(0.5, 5);

      expect(frames2.length).toBe(1);
      expect(frames2[0].sourceId).toBe('p2');
      expect(frames2[0].data[0]).toBeCloseTo(0.8, 5);

      observer2.destroy();
    });
  });
});
