/**
 * @vestara/media-conference — Audio Observer Types
 *
 * Provider-neutral, non-destructive audio observation over remote MediaStreams.
 * The observer taps into a MediaStream's audio track, produces normalized
 * PCM frames, and leaves conference playback unaffected.
 *
 * Ownership:
 *   AudioObserver owns: AudioContext, Web Audio nodes, observation lifecycle
 *   Conference owns: MediaStream lifecycle, participant association
 *   Future consumers own: VAD, STT, meters
 *
 * Input authority:
 *   Native browser MediaStream/MediaStreamTrack — never OpenVidu objects.
 *
 * Output contract:
 *   Bounded PCM frames with metadata. Suitable for future VAD/STT.
 *
 * Non-destructive:
 *   Conference playback continues while observation is active.
 *   The observer taps into the audio stream without consuming it.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-007 Audio Observation
 */

// ─── Audio Frame ─────────────────────────────────────────────

/**
 * Normalized audio frame from an observed MediaStream.
 *
 * Contains bounded PCM data plus metadata identifying the source.
 * Future consumers (VAD, STT, meters) receive these frames.
 */
export interface AudioFrame {
  /** Participant/stream identifier. */
  readonly sourceId: string;

  /** Sample rate in Hz (e.g. 48000). */
  readonly sampleRate: number;

  /** Number of audio channels (1 = mono, 2 = stereo). */
  readonly channels: number;

  /** Timestamp in ms (performance.now() or Date.now()). */
  readonly timestamp: number;

  /** Peak absolute amplitude in this frame (range [0, 1]). */
  readonly peak: number;

  /** Bounded PCM frame data (float32 samples, range [-1, 1]). */
  readonly data: Float32Array;
}

/**
 * Callback for receiving audio frames.
 */
export type AudioFrameCallback = (frame: AudioFrame) => void;

/**
 * Observer state.
 */
export type AudioObserverState = 'idle' | 'observing' | 'stopped' | 'destroyed';

// ─── AudioObserver Interface ─────────────────────────────────

/**
 * Provider-neutral audio observer.
 *
 * Observes a MediaStream's audio track and produces normalized
 * PCM frames. The observer is non-destructive — conference playback
 * continues while observation is active.
 *
 * Lifecycle:
 *   idle → observing → stopped
 *         ↘ destroyed
 *
 * Multiple attach/detach cycles must not leak AudioContext, nodes,
 * listeners, timers, or MediaStream references.
 */
export interface AudioObserver {
  /** Current observer state. */
  readonly state: AudioObserverState;

  /**
   * Attach to a MediaStream and begin observing its audio track.
   *
   * If the MediaStream has no audio track, this is a no-op (state remains 'idle').
   * If already observing, detaches from the current stream first.
   *
   * @param mediaStream - The MediaStream to observe
   * @param sourceId - Identifier for the audio source (participant/stream ID)
   */
  attach(mediaStream: MediaStream, sourceId: string): void;

  /**
   * Detach from the current MediaStream and stop observing.
   *
   * Releases AudioContext, nodes, and listeners.
   * Idempotent — safe to call when already detached.
   */
  detach(): void;

  /**
   * Register a callback for receiving audio frames.
   *
   * Only one callback is active at a time. Calling again replaces the previous callback.
   *
   * @param callback - The callback to invoke with audio frames
   */
  onFrame(callback: AudioFrameCallback): void;

  /**
   * Remove the frame callback.
   */
  offFrame(): void;

  /**
   * Destroy the observer and release all resources.
   *
   * After destroy(), the observer cannot be reused.
   */
  destroy(): void;
}
