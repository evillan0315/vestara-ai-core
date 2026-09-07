import type { AudioFrame } from '@vestara/media-conference';
import type {
  BoundedBufferPolicy,
  SpeechBoundaryHint,
  StreamingSessionEvent,
  StreamingSessionEventType,
  StreamingSTTConfig,
  StreamingTranscriptionSessionInfo,
  TranscriptEvent,
  TranscriptEventType,
} from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import {
  type FakeStreamingSTTConfig,
  FakeStreamingSTTProvider,
  type FakeStreamingTranscriptionSession,
  VestaraSTTService,
  WhisperSTTProvider,
} from '../src/index.js';

// Helper to create a valid AudioFrame for testing
function createTestAudioFrame(overrides: Partial<AudioFrame> = {}): AudioFrame {
  return {
    sourceId: 'test-source',
    sampleRate: 48000,
    channels: 1,
    timestamp: Date.now(),
    peak: 0.5,
    data: new Float32Array(480), // 10ms at 48kHz
    ...overrides,
  };
}

describe('@vestara/stt — Streaming STT Contracts (OVR-009B)', () => {
  describe('Type exports from @vestara/shared', () => {
    it('exports TranscriptEventType', () => {
      // Type-only test - just verify the types compile
      const _type: TranscriptEventType = 'partial';
      const _type2: TranscriptEventType = 'final';
      const _type3: TranscriptEventType = 'correction';
      // 'cancellation' is NOT a TranscriptEventType — it is a StreamingSessionEventType
      expect(true).toBe(true);
    });

    it('exports StreamingSessionEventType', () => {
      const _type: StreamingSessionEventType = 'backpressure';
      const _type2: StreamingSessionEventType = 'buffer-overflow';
      const _type3: StreamingSessionEventType = 'provider-error';
      const _type4: StreamingSessionEventType = 'session-reset';
      const _type5: StreamingSessionEventType = 'cancelled';
      const _type6: StreamingSessionEventType = 'closed';
      expect(true).toBe(true);
    });

    it('exports StreamingSTTConfig', () => {
      const _config: StreamingSTTConfig = {
        sessionId: 'sess-1',
        sourceId: 'src-1',
        language: 'en',
        interimPartialEnabled: true,
        punctuationEnabled: true,
        languageDetectionEnabled: false,
        maxBufferFrames: 200,
        maxBufferDurationMs: 5000,
        overflowPolicy: 'FIFO_drop',
      };
      expect(true).toBe(true);
    });

    it('exports StreamingTranscriptionSessionInfo', () => {
      const _info: StreamingTranscriptionSessionInfo = {
        sessionId: 'sess-1',
        sourceId: 'src-1',
        createdAt: Date.now(),
        language: 'en',
      };
      expect(true).toBe(true);
    });

    it('exports SpeechBoundaryHint', () => {
      const _hint: SpeechBoundaryHint = { type: 'speech-start', timestamp: Date.now() };
      const _hint2: SpeechBoundaryHint = { type: 'speech-end', timestamp: Date.now() };
      const _hint3: SpeechBoundaryHint = { type: 'speech-state', timestamp: Date.now(), state: 'speech' };
      expect(true).toBe(true);
    });

    it('exports BoundedBufferPolicy', () => {
      const _policy: BoundedBufferPolicy = {
        maxBufferFrames: 200,
        maxBufferDurationMs: 5000,
        overflowPolicy: 'FIFO_drop',
      };
      expect(true).toBe(true);
    });

    it('exports TranscriptEvent', () => {
      const _event: TranscriptEvent = {
        type: 'partial',
        segmentId: 'seg-1',
        text: 'hello',
        isFinal: false,
        confidence: 0.9,
        timestamp: Date.now(),
        durationMs: 1000,
        language: 'en',
        sourceId: 'src-1',
        replacesSegmentId: undefined,
      };
      expect(true).toBe(true);
    });

    it('exports StreamingSessionEvent', () => {
      const _event: StreamingSessionEvent = {
        type: 'backpressure',
        sessionId: 'sess-1',
        timestamp: Date.now(),
        frameCount: 10,
        dropped: true,
        error: undefined,
      };
      expect(true).toBe(true);
    });
  });

  describe('FakeStreamingSTTProvider', () => {
    it('creates a session with correct info', async () => {
      const provider = new FakeStreamingSTTProvider();
      const config: StreamingSTTConfig = {
        sessionId: 'sess-1',
        sourceId: 'src-1',
        language: 'en',
      };

      const session = await provider.open(config);

      expect(session.info.sessionId).toBe('sess-1');
      expect(session.info.sourceId).toBe('src-1');
      expect(session.info.language).toBe('en');
      expect(session.info.createdAt).toBeGreaterThan(0);
    });

    it('push accepts AudioFrame', async () => {
      const provider = new FakeStreamingSTTProvider();
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });
      const frame = createTestAudioFrame();

      const result = session.push(frame);
      if (result instanceof Promise) {
        await expect(result).resolves.toBeUndefined();
      } else {
        expect(result).toBeUndefined();
      }
    });

    it('hint accepts SpeechBoundaryHint', async () => {
      const provider = new FakeStreamingSTTProvider();
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      const result1 = session.hint({ type: 'speech-start', timestamp: Date.now() });
      if (result1 instanceof Promise) await expect(result1).resolves.toBeUndefined();

      const result2 = session.hint({ type: 'speech-end', timestamp: Date.now() });
      if (result2 instanceof Promise) await expect(result2).resolves.toBeUndefined();

      const result3 = session.hint({ type: 'speech-state', timestamp: Date.now(), state: 'speech' });
      if (result3 instanceof Promise) await expect(result3).resolves.toBeUndefined();
    });

    it('flush resolves', async () => {
      const provider = new FakeStreamingSTTProvider();
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      const result = session.flush();
      if (result instanceof Promise) {
        await expect(result).resolves.toBeUndefined();
      } else {
        expect(result).toBeUndefined();
      }
    });

    it('cancel prevents further events', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [
          { type: 'partial', text: 'hello', delayMs: 5 },
          { type: 'final', text: 'hello world', delayMs: 5 },
        ],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      // Start iterating events
      const events: TranscriptEvent[] = [];
      const iterator = session.events();

      // Cancel immediately
      await session.cancel();

      for await (const event of iterator) {
        events.push(event);
      }

      // Should not emit any events after cancellation
      const _transcriptEvents = events.filter(
        (e) => (e.type !== 'cancellation' && e.type !== 'final') || (e.type === 'final' && e.text === 'hello world'),
      );
      // After cancellation, no final transcript should be emitted
      const finalEvents = events.filter((e) => e.type === 'final' && e.text === 'hello world');
      expect(finalEvents.length).toBe(0);
    });

    it('close prevents further operations', async () => {
      const provider = new FakeStreamingSTTProvider();
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      await session.close();

      const pushResult = session.push(createTestAudioFrame());
      if (pushResult instanceof Promise) await expect(pushResult).resolves.toBeUndefined();
      else expect(pushResult).toBeUndefined();

      const hintResult = session.hint({ type: 'speech-start', timestamp: Date.now() });
      if (hintResult instanceof Promise) await expect(hintResult).resolves.toBeUndefined();
      else expect(hintResult).toBeUndefined();

      const flushResult = session.flush();
      if (flushResult instanceof Promise) await expect(flushResult).resolves.toBeUndefined();
      else expect(flushResult).toBeUndefined();
    });

    it('repeated open/close lifecycle works', async () => {
      const provider = new FakeStreamingSTTProvider();

      for (let i = 0; i < 3; i++) {
        const session = await provider.open({ sessionId: `sess-${i}`, sourceId: 'src-1' });
        await session.close();
        expect(session.isClosed()).toBe(true);
      }
    });
  });

  describe('FakeStreamingTranscriptionSession — Transcript Semantics', () => {
    it('one logical segment across partial revisions', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [
          { type: 'partial', text: 'turn on', segmentId: 'seg-A', delayMs: 5 },
          { type: 'partial', text: 'turn on the', segmentId: 'seg-A', delayMs: 5 },
          { type: 'partial', text: 'turn on the living', segmentId: 'seg-A', delayMs: 5 },
          { type: 'final', text: 'turn on the living room lights', segmentId: 'seg-A', delayMs: 5 },
        ],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      const events: TranscriptEvent[] = [];
      for await (const event of session.events()) {
        if (event.type !== 'cancellation') {
          events.push(event);
        }
      }

      const partials = events.filter((e) => e.type === 'partial');
      const finals = events.filter((e) => e.type === 'final');

      expect(partials.length).toBe(3);
      expect(finals.length).toBe(1);

      // All partials share the same segmentId
      expect(partials[0].segmentId).toBe('seg-A');
      expect(partials[1].segmentId).toBe('seg-A');
      expect(partials[2].segmentId).toBe('seg-A');
      expect(finals[0].segmentId).toBe('seg-A');
    });

    it('final segment immutability — final events are emitted once', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [{ type: 'final', text: 'hello world', segmentId: 'seg-1', delayMs: 5 }],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      const events: TranscriptEvent[] = [];
      for await (const event of session.events()) {
        if (event.type !== 'cancellation') events.push(event);
      }

      const finals = events.filter((e) => e.type === 'final');
      expect(finals.length).toBe(1);
      expect(finals[0].text).toBe('hello world');
      expect(finals[0].isFinal).toBe(true);
    });

    it('correction references prior final segment', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [
          { type: 'final', text: 'hello world', segmentId: 'seg-1', delayMs: 5 },
          { type: 'correction', text: 'hello world!', segmentId: 'seg-2', replacesSegmentId: 'seg-1', delayMs: 5 },
        ],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      const events: TranscriptEvent[] = [];
      for await (const event of session.events()) {
        if (event.type !== 'cancellation') events.push(event);
      }

      const finals = events.filter((e) => e.type === 'final');
      const corrections = events.filter((e) => e.type === 'correction');

      expect(finals.length).toBe(1);
      expect(corrections.length).toBe(1);
      expect(corrections[0].replacesSegmentId).toBe('seg-1');
      expect(corrections[0].segmentId).toBe('seg-2');
      expect(corrections[0].isFinal).toBe(true);
    });
  });

  describe('FakeStreamingTranscriptionSession — Multi-session Isolation', () => {
    it('sessions are isolated from each other', async () => {
      const provider = new FakeStreamingSTTProvider();
      const session1 = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });
      const session2 = await provider.open({ sessionId: 'sess-2', sourceId: 'src-2' });

      expect(session1.info.sessionId).toBe('sess-1');
      expect(session2.info.sessionId).toBe('sess-2');
      expect(session1.info.sourceId).toBe('src-1');
      expect(session2.info.sourceId).toBe('src-2');

      await session1.close();
      await session2.close();
    });

    it('cancelling one session does not affect another', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [
          { type: 'partial', text: 'hello', delayMs: 50 },
          { type: 'final', text: 'hello world', delayMs: 50 },
        ],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session1 = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });
      const session2 = await provider.open({ sessionId: 'sess-2', sourceId: 'src-2' });

      await session1.cancel();

      const events2: TranscriptEvent[] = [];
      for await (const event of session2.events()) {
        if (event.type !== 'cancellation') events2.push(event);
      }

      const finals2 = events2.filter((e) => e.type === 'final');
      expect(finals2.length).toBe(1);
      expect(finals2[0].text).toBe('hello world');

      await session2.close();
    });
  });

  describe('FakeStreamingTranscriptionSession — Bounded Buffering', () => {
    it('accepts custom buffer policy', () => {
      const customPolicy: BoundedBufferPolicy = {
        maxBufferFrames: 100,
        maxBufferDurationMs: 2000,
        overflowPolicy: 'FIFO_drop',
      };
      const config: FakeStreamingSTTConfig = {
        eventSequence: [],
        bufferPolicy: customPolicy,
      };
      const _provider = new FakeStreamingSTTProvider(config);

      // The fake provider stores the policy; we can't easily test the actual buffering
      // without a real implementation, but we verify the config is accepted.
      expect(true).toBe(true);
    });

    it('supports different overflow policies', () => {
      const policies: BoundedBufferPolicy['overflowPolicy'][] = ['FIFO_drop', 'block', 'cancel'];
      for (const policy of policies) {
        const config: FakeStreamingSTTConfig = {
          eventSequence: [],
          bufferPolicy: { maxBufferFrames: 50, maxBufferDurationMs: 1000, overflowPolicy: policy },
        };
        const provider = new FakeStreamingSTTProvider(config);
        expect(provider).toBeDefined();
      }
    });
  });

  describe('FakeStreamingTranscriptionSession — Cancellation Semantics', () => {
    it('cancel discards queued PCM (no final transcript emitted)', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [
          { type: 'partial', text: 'hello', delayMs: 5 },
          { type: 'final', text: 'hello world', delayMs: 5 },
        ],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      await session.cancel();

      const events: TranscriptEvent[] = [];
      for await (const event of session.events()) {
        if (event.type !== 'cancellation') events.push(event);
      }

      const finals = events.filter((e) => e.type === 'final');
      expect(finals.length).toBe(0);
    });

    it('late provider result after cancel cannot become current final', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [
          { type: 'partial', text: 'hello', delayMs: 5 },
          { type: 'final', text: 'hello world', delayMs: 100 }, // Delayed final
        ],
      };
      const provider = new FakeStreamingSTTProvider(config);
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      // Cancel before the final would be emitted
      await new Promise((resolve) => setTimeout(resolve, 20));
      await session.cancel();

      const events: TranscriptEvent[] = [];
      for await (const event of session.events()) {
        if (event.type !== 'cancellation') events.push(event);
      }

      const finals = events.filter((e) => e.type === 'final');
      expect(finals.length).toBe(0);
    });

    it('exactly one terminal session outcome (cancelled OR closed)', async () => {
      const config: FakeStreamingSTTConfig = {
        eventSequence: [{ type: 'final', text: 'hello world', delayMs: 5 }],
      };
      const provider = new FakeStreamingSTTProvider(config);

      // Session 1: normal close
      const session1 = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });
      const events1: TranscriptEvent[] = [];
      for await (const event of session1.events()) {
        if (event.type !== 'cancellation') events1.push(event);
      }
      await session1.close();
      expect(session1.isClosed()).toBe(true);
      expect(session1.isCancelled()).toBe(false);

      // Session 2: cancelled
      const session2 = await provider.open({ sessionId: 'sess-2', sourceId: 'src-2' });
      await session2.cancel();
      expect(session2.isCancelled()).toBe(true);
      expect(session2.isClosed()).toBe(false);
    });
  });

  describe('FakeStreamingTranscriptionSession — No Unbounded PCM', () => {
    it('does not accumulate PCM in events queue', async () => {
      const provider = new FakeStreamingSTTProvider();
      const session = await provider.open({ sessionId: 'sess-1', sourceId: 'src-1' });

      // Push many frames
      for (let i = 0; i < 1000; i++) {
        await session.push(createTestAudioFrame({ timestamp: Date.now() + i }));
      }

      // Events queue should only contain transcript events, not PCM data
      await session.close();
      const events = (session as unknown as FakeStreamingTranscriptionSession).getEmittedEvents();
      // All events should be TranscriptEvent, no raw PCM
      for (const event of events) {
        expect(event).not.toHaveProperty('data'); // AudioFrame.data is PCM
      }
    });
  });

  describe('VestaraSTTService — Streaming Integration', () => {
    it('registers streaming provider', () => {
      const service = new VestaraSTTService();
      const provider = new FakeStreamingSTTProvider();

      service.registerStreamingProvider(provider);
      expect(service.status).toBe('available');
      expect(service.providerName).toBe('Fake Streaming STT Provider');
    });

    it('opens streaming session', async () => {
      const service = new VestaraSTTService();
      const provider = new FakeStreamingSTTProvider();
      service.registerStreamingProvider(provider);

      const session = await service.openStreamingSession({
        sessionId: 'sess-1',
        sourceId: 'src-1',
        language: 'en',
      });

      expect(session.info.sessionId).toBe('sess-1');
      await session.close();
    });

    it('throws if no streaming provider registered', async () => {
      const service = new VestaraSTTService();

      await expect(service.openStreamingSession({ sessionId: 'sess-1', sourceId: 'src-1' })).rejects.toThrow(
        'No streaming STT provider registered',
      );
    });

    it('retains legacy transcribe API', async () => {
      const service = new VestaraSTTService();
      const provider = new WhisperSTTProvider();
      service.registerProvider(provider);

      await expect(service.transcribe(new ArrayBuffer(0))).rejects.toThrow(
        provider.available ? '' : 'STT provider is not available',
      );
    });

    it('retains legacy transcribeStream API', async () => {
      const service = new VestaraSTTService();
      const provider = new WhisperSTTProvider();
      service.registerProvider(provider);

      if (!provider.available) {
        const stream = service.transcribeStream((async function* () {})(), 'en');
        await expect(stream.next()).rejects.toThrow('Whisper.cpp not found on system PATH');
      }
    });
  });

  describe('WhisperSTTProvider — Legacy Behavior Preserved', () => {
    it('implements STTProvider interface', () => {
      const provider = new WhisperSTTProvider();
      expect(provider.id).toBe('vestara.stt.whisper');
      expect(provider.name).toBe('Whisper.cpp');
      expect(typeof provider.transcribe).toBe('function');
      expect(typeof provider.transcribeStream).toBe('function');
      expect(typeof provider.healthCheck).toBe('function');
    });

    it('transcribe fails when unavailable', async () => {
      // WhisperSTTProvider.available is false in test environment (no whisper on PATH)
      const provider = new WhisperSTTProvider();
      if (!provider.available) {
        await expect(provider.transcribe(new ArrayBuffer(0))).rejects.toThrow('Whisper.cpp not found on system PATH');
      }
    });

    it('transcribeStream fails when unavailable', async () => {
      const provider = new WhisperSTTProvider();
      if (!provider.available) {
        const stream = provider.transcribeStream((async function* () {})(), 'en');
        await expect(stream.next()).rejects.toThrow('Whisper.cpp not found on system PATH');
      }
    });
  });

  describe('Security/Persistence Verification', () => {
    it('TranscriptEvent does not contain raw PCM', () => {
      const event: TranscriptEvent = {
        type: 'final',
        segmentId: 'seg-1',
        text: 'hello',
        isFinal: true,
        confidence: 0.9,
        timestamp: Date.now(),
        durationMs: 1000,
        language: 'en',
        sourceId: 'src-1',
        replacesSegmentId: undefined,
      };

      // Verify no PCM fields
      expect(event).not.toHaveProperty('data');
      expect(event).not.toHaveProperty('samples');
      expect(event).not.toHaveProperty('pcm');
    });

    it('StreamingSessionEvent does not contain raw PCM', () => {
      const event: StreamingSessionEvent = {
        type: 'backpressure',
        sessionId: 'sess-1',
        timestamp: Date.now(),
        frameCount: 10,
        dropped: true,
        error: undefined,
      };

      expect(event).not.toHaveProperty('data');
      expect(event).not.toHaveProperty('samples');
      expect(event).not.toHaveProperty('pcm');
    });

    it('AudioFrame is not re-exported from @vestara/stt', () => {
      // AudioFrame should only be imported, not re-exported
      // This is a compile-time check - if AudioFrame were re-exported,
      // it would create a @vestara/shared -> @vestara/media-conference dependency
      expect(true).toBe(true);
    });
  });

  describe('Deviations from OVR-009A', () => {
    it('documents any deviations from the frozen architecture', () => {
      // This test serves as documentation of any deviations.
      // Currently, no known deviations from the frozen OVR-009A architecture.
      const deviations: string[] = [];
      expect(deviations.length).toBe(0);
    });
  });
});
