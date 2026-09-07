/**
 * @vestara/audio — WebRTC & OpenVidu Audio Capture Providers
 *
 * Capture audio from real-time communication streams:
 *   - WebRTC: RTCPeerConnection audio tracks
 *   - OpenVidu: Session/publisher/subscriber audio streams
 *
 * Both follow the same SpeakerCaptureProvider interface — audio arrives
 * as AsyncIterable<ArrayBuffer> chunks, ready for STT processing.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Multi-Source Audio Capture
 */

import type { Logger } from '@vestara/logger';
import type { AudioConfig } from '@vestara/shared';
import type { SpeakerCaptureProvider } from './index.js';

// ─── WebRTC Audio Capture ─────────────────────────────────────

/**
 * WebRTC audio source — captures audio from an RTCPeerConnection's
 * remote audio tracks. Works in both browser and Node.js (via werift
 * or node-datachannel).
 *
 * In browser: accepts a MediaStream or MediaStreamTrack.
 * In Node.js: accepts a WebRTC peer connection object with getReceivers().
 */
export interface WebRTCAudioSource {
  /** The MediaStream containing audio tracks. */
  readonly mediaStream?: unknown;
  /** Or a peer connection object with getReceivers(). */
  readonly peerConnection?: {
    getReceivers(): Array<{
      readonly track: { kind: string; readyState: string } | null;
    }>;
  };
}

export class WebRTCAudioCaptureProvider implements SpeakerCaptureProvider {
  readonly id = 'vestara.audio-capture.webrtc';
  readonly name = 'WebRTC Audio Capture';
  readonly available = true;
  private capturing = false;
  private source: WebRTCAudioSource | null = null;
  private logger?: Logger;
  private chunkQueue: ArrayBuffer[] = [];
  private waitingResolve: ((value: IteratorResult<ArrayBuffer>) => void) | null = null;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'webrtc-audio-capture' });
  }

  /**
   * Attach a WebRTC source (MediaStream or RTCPeerConnection).
   * Call before startCapture().
   */
  attachSource(source: WebRTCAudioSource): void {
    this.source = source;
    this.logger?.info('WebRTC source attached');
  }

  async startCapture(_config?: AudioConfig): Promise<void> {
    if (!this.source) {
      throw new Error('No WebRTC source attached. Call attachSource() first.');
    }
    this.capturing = true;
    this._attachTrackListeners();
    this.logger?.info('WebRTC audio capture started');
  }

  async stopCapture(): Promise<void> {
    this.capturing = false;
    this._detachTrackListeners();
    if (this.waitingResolve) {
      this.waitingResolve({ value: undefined, done: true });
      this.waitingResolve = null;
    }
    this.logger?.info('WebRTC audio capture stopped');
  }

  async *getAudioStream(): AsyncIterable<ArrayBuffer> {
    if (!this.capturing) {
      throw new Error('Not capturing. Call startCapture() first.');
    }

    while (this.capturing) {
      // Yield any queued chunks
      while (this.chunkQueue.length > 0) {
        yield this.chunkQueue.shift()!;
      }
      // Wait for next chunk
      const result = await new Promise<IteratorResult<ArrayBuffer>>((resolve) => {
        this.waitingResolve = resolve;
        // Timeout to allow checking capturing flag
        setTimeout(() => {
          if (this.waitingResolve === resolve) {
            resolve({ value: undefined as unknown as ArrayBuffer, done: true });
          }
        }, 100);
      });
      if (result.done) break;
      if (result.value) yield result.value;
    }
  }

  async getDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    if (!this.source) return [];
    const tracks = this._getAudioTracks();
    return tracks.map((track, i) => ({
      id: `webrtc-track-${i}`,
      name: `WebRTC Audio Track ${i + 1}`,
      isDefault: i === 0,
    }));
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    const tracks = this._getAudioTracks();
    const activeTracks = tracks.filter((t) => t.readyState === 'live');
    return {
      status: activeTracks.length > 0 ? 'healthy' : tracks.length > 0 ? 'degraded' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }

  // ─── Private ──────────────────────────────────────────────

  private _getAudioTracks(): Array<{ kind: string; readyState: string }> {
    if (!this.source) return [];

    // From MediaStream
    if (this.source.mediaStream) {
      const ms = this.source.mediaStream as {
        getAudioTracks?(): Array<{ kind: string; readyState: string }>;
      };
      if (ms.getAudioTracks) return ms.getAudioTracks();
    }

    // From RTCPeerConnection
    if (this.source.peerConnection) {
      return this.source.peerConnection
        .getReceivers()
        .map((r) => r.track)
        .filter((t): t is { kind: string; readyState: string } => t !== null && t.kind === 'audio');
    }

    return [];
  }

  private _attachTrackListeners(): void {
    const tracks = this._getAudioTracks();
    for (const track of tracks) {
      // In browser, track would be a MediaStreamTrack with ondataavailable
      // In Node.js with werift, similar event-based API
      // The actual event binding depends on the runtime environment
      this.logger?.debug('Attaching to audio track', { kind: track.kind });
    }
  }

  private _detachTrackListeners(): void {
    // Cleanup event listeners
  }

  /** Called by the WebRTC runtime when audio data arrives. */
  _onAudioData(chunk: ArrayBuffer): void {
    if (!this.capturing) return;
    if (this.waitingResolve) {
      const resolve = this.waitingResolve;
      this.waitingResolve = null;
      resolve({ value: chunk, done: false });
    } else {
      this.chunkQueue.push(chunk);
    }
  }
}

// ─── OpenVidu Audio Capture ───────────────────────────────────

/**
 * OpenVidu session audio source — captures audio from OpenVidu
 * Publisher and/or Subscriber streams.
 *
 * OpenVidu is built on WebRTC, so this adapter translates OpenVidu
 * events into the standard audio capture interface.
 */
export interface OpenViduAudioSource {
  /** OpenVidu Session object. */
  readonly session?: {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    off?: (event: string, handler: (...args: unknown[]) => void) => void;
    once?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  /** OpenVidu Publisher (local user's audio). */
  readonly publisher?: {
    readonly stream?: {
      getMediaStream?(): unknown;
    };
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  /** OpenVidu Subscriber (remote user's audio). */
  readonly subscriber?: {
    readonly stream?: {
      getMediaStream?(): unknown;
    };
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  /** Or an array of subscribers to capture from. */
  readonly subscribers?: Array<{
    readonly stream?: {
      getMediaStream?(): unknown;
    };
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
  }>;
}

export class OpenViduAudioCaptureProvider implements SpeakerCaptureProvider {
  readonly id = 'vestara.audio-capture.openvidu';
  readonly name = 'OpenVidu Audio Capture';
  readonly available = true;
  private capturing = false;
  private source: OpenViduAudioSource | null = null;
  private logger?: Logger;
  private chunkQueue: ArrayBuffer[] = [];
  private waitingResolve: ((value: IteratorResult<ArrayBuffer>) => void) | null = null;
  private handlers: Array<{ target: unknown; event: string; handler: (...args: unknown[]) => void }> = [];

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'openvidu-audio-capture' });
  }

  /**
   * Attach an OpenVidu source (session, publisher, subscriber).
   * Call before startCapture().
   */
  attachSource(source: OpenViduAudioSource): void {
    this.source = source;
    this.logger?.info('OpenVidu source attached');
  }

  async startCapture(_config?: AudioConfig): Promise<void> {
    if (!this.source) {
      throw new Error('No OpenVidu source attached. Call attachSource() first.');
    }
    this.capturing = true;
    this._attachOpenViduListeners();
    this.logger?.info('OpenVidu audio capture started');
  }

  async stopCapture(): Promise<void> {
    this.capturing = false;
    this._detachOpenViduListeners();
    if (this.waitingResolve) {
      this.waitingResolve({ value: undefined, done: true });
      this.waitingResolve = null;
    }
    this.logger?.info('OpenVidu audio capture stopped');
  }

  async *getAudioStream(): AsyncIterable<ArrayBuffer> {
    if (!this.capturing) {
      throw new Error('Not capturing. Call startCapture() first.');
    }

    while (this.capturing) {
      while (this.chunkQueue.length > 0) {
        yield this.chunkQueue.shift()!;
      }
      const result = await new Promise<IteratorResult<ArrayBuffer>>((resolve) => {
        this.waitingResolve = resolve;
        setTimeout(() => {
          if (this.waitingResolve === resolve) {
            resolve({ value: undefined as unknown as ArrayBuffer, done: true });
          }
        }, 100);
      });
      if (result.done) break;
      if (result.value) yield result.value;
    }
  }

  async getDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    const devices: Array<{ id: string; name: string; isDefault: boolean }> = [];

    if (this.source?.publisher?.stream) {
      devices.push({
        id: 'openvidu-publisher',
        name: 'OpenVidu Publisher (local)',
        isDefault: true,
      });
    }

    const subs = this.source?.subscribers ?? (this.source?.subscriber ? [this.source.subscriber] : []);
    for (let i = 0; i < subs.length; i++) {
      devices.push({
        id: `openvidu-subscriber-${i}`,
        name: `OpenVidu Subscriber ${i + 1} (remote)`,
        isDefault: false,
      });
    }

    return devices;
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    const hasSource = this.source?.publisher || this.source?.subscriber || (this.source?.subscribers?.length ?? 0) > 0;
    return {
      status: hasSource ? 'healthy' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }

  // ─── Private ──────────────────────────────────────────────

  private _attachOpenViduListeners(): void {
    if (!this.source) return;

    // Listen to publisher audio events
    if (this.source.publisher?.on) {
      const handler = (...args: unknown[]) => this._handlePublisherEvent(args);
      this.source.publisher.on('stream audio:updated', handler);
      this.handlers.push({ target: this.source.publisher, event: 'stream audio:updated', handler });
    }

    // Listen to subscriber audio events
    const subs = this.source.subscribers ?? (this.source?.subscriber ? [this.source.subscriber] : []);
    for (const sub of subs) {
      if (sub?.on) {
        const handler = (...args: unknown[]) => this._handleSubscriberEvent(args);
        sub.on('stream audio:updated', handler);
        this.handlers.push({ target: sub, event: 'stream audio:updated', handler });
      }
    }

    // Listen to session-level events
    if (this.source.session?.on) {
      const handler = (...args: unknown[]) => this._handleSessionEvent(args);
      this.source.session.on('streamCreated', handler);
      this.handlers.push({ target: this.source.session, event: 'streamCreated', handler });

      const audioHandler = (...args: unknown[]) => this._handleSessionEvent(args);
      this.source.session.on('audioReceivingChanged', audioHandler);
      this.handlers.push({ target: this.source.session, event: 'audioReceivingChanged', handler: audioHandler });
    }
  }

  private _detachOpenViduListeners(): void {
    for (const { target, event, handler } of this.handlers) {
      if (target && typeof target === 'object' && 'off' in target) {
        (target as { off: (e: string, h: (...args: unknown[]) => void) => void }).off(event, handler);
      }
    }
    this.handlers = [];
  }

  private _handlePublisherEvent(_args: unknown[]): void {
    // Extract audio data from publisher stream
    const mediaStream = this.source?.publisher?.stream?.getMediaStream?.();
    if (mediaStream) {
      this._extractAudioFromMediaStream(mediaStream);
    }
  }

  private _handleSubscriberEvent(_args: unknown[]): void {
    // Extract audio from subscriber streams
    const subs = this.source?.subscribers ?? [];
    for (const sub of subs) {
      const mediaStream = sub?.stream?.getMediaStream?.();
      if (mediaStream) {
        this._extractAudioFromMediaStream(mediaStream);
      }
    }
  }

  private _handleSessionEvent(_args: unknown[]): void {
    this.logger?.debug('OpenVidu session audio event');
  }

  private _extractAudioFromMediaStream(_mediaStream: unknown): void {
    // In browser: use AudioContext + MediaStreamAudioSourceNode + ScriptProcessorNode/AudioWorklet
    // In Node.js: use the raw media stream data
    // This is a stub — real implementation depends on the runtime environment
    this.logger?.debug('Extracting audio from MediaStream');
  }

  /** Called by the OpenVidu runtime when audio data arrives. */
  _onAudioData(chunk: ArrayBuffer): void {
    if (!this.capturing) return;
    if (this.waitingResolve) {
      const resolve = this.waitingResolve;
      this.waitingResolve = null;
      resolve({ value: chunk, done: false });
    } else {
      this.chunkQueue.push(chunk);
    }
  }
}

// ─── Combined WebRTC + OpenVidu Adapter ───────────────────────

/**
 * Unified adapter that can capture from multiple audio sources
 * simultaneously: local mic, WebRTC peer, and OpenVidu session.
 *
 * Merges all sources into a single AsyncIterable<AudioChunk>
 * tagged with the source identity.
 */
export interface AudioSourceChunk {
  readonly sourceId: string;
  readonly sourceType: 'microphone' | 'webrtc' | 'openvidu' | 'speaker';
  readonly data: ArrayBuffer;
  readonly timestamp: number;
}

export class MultiSourceAudioCapture {
  private sources: Map<string, SpeakerCaptureProvider> = new Map();
  private logger?: Logger;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'multi-source-audio' });
  }

  /**
   * Register an audio source by name.
   */
  addSource(id: string, provider: SpeakerCaptureProvider): void {
    this.sources.set(id, provider);
    this.logger?.info(`Audio source added: ${id}`, { name: provider.name });
  }

  /**
   * Remove an audio source.
   */
  removeSource(id: string): void {
    this.sources.delete(id);
    this.logger?.info(`Audio source removed: ${id}`);
  }

  /**
   * Start capturing from all registered sources.
   */
  async startAll(): Promise<void> {
    for (const [id, source] of this.sources) {
      try {
        await source.startCapture();
        this.logger?.info(`Source started: ${id}`);
      } catch (error) {
        this.logger?.warn(`Failed to start source ${id}: ${error}`);
      }
    }
  }

  /**
   * Stop capturing from all sources.
   */
  async stopAll(): Promise<void> {
    for (const [id, source] of this.sources) {
      try {
        await source.stopCapture();
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Merged audio stream from all sources, tagged with source identity.
   */
  async *getMergedStream(): AsyncIterable<AudioSourceChunk> {
    const iterators = new Map<string, AsyncIterable<ArrayBuffer>>();

    for (const [id, source] of this.sources) {
      try {
        iterators.set(id, source.getAudioStream());
      } catch {
        this.logger?.warn(`Source ${id} not ready`);
      }
    }

    // Round-robin merge from all active iterators
    while (iterators.size > 0) {
      for (const [id, iter] of iterators) {
        const result = await iter[Symbol.asyncIterator]().next();
        if (result.done) {
          iterators.delete(id);
        } else {
          const sourceType = id.includes('webrtc')
            ? 'webrtc'
            : id.includes('openvidu')
              ? 'openvidu'
              : id.includes('speaker')
                ? 'speaker'
                : 'microphone';
          yield {
            sourceId: id,
            sourceType: sourceType as AudioSourceChunk['sourceType'],
            data: result.value,
            timestamp: Date.now(),
          };
        }
      }
    }
  }

  /**
   * Health status of all sources.
   */
  async healthCheckAll(): Promise<
    Array<{
      id: string;
      name: string;
      status: 'healthy' | 'degraded' | 'unhealthy';
      latency: number;
    }>
  > {
    const results = [];
    for (const [id, source] of this.sources) {
      const health = await source.healthCheck();
      results.push({ id, name: source.name, ...health });
    }
    return results;
  }
}
