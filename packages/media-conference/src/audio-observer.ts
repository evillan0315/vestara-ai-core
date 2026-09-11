/**
 * @vestara/media-conference — AudioObserver Implementation
 *
 * Non-destructive audio observation over remote MediaStreams using
 * AudioWorkletNode (production Web Audio API).
 *
 * Architecture:
 *   MediaStream → MediaStreamAudioSourceNode → AudioWorkletNode → callback
 *                                  ↓
 *                           default destination (playback continues)
 *
 * The observer taps into the audio stream in parallel with playback.
 * Conference audio is NOT consumed or muted by the observer.
 *
 * Lifecycle:
 *   attach() → creates AudioContext + loads worklet module + creates nodes → 'observing'
 *   detach() → disconnects nodes, closes AudioContext → 'stopped'
 *   destroy() → detach() + releases all references → unusable
 *
 * Memory safety:
 *   - AudioContext is closed on detach/destroy
 *   - AudioWorkletNode is disconnected and dereferenced
 *   - Processor is stopped via port message
 *   - MediaStream reference is released on detach
 *   - No timers, no listeners, no leaked references
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-007 Audio Observation
 */

import type {
  AudioFrame,
  AudioFrameCallback,
  AudioObserverState,
  AudioObserver as IAudioObserver,
} from './audio-observer-types.js';

// ─── Configuration ───────────────────────────────────────────

/**
 * Processor module URL — resolved at bundle time by Vite.
 * The consuming app's bundler resolves this to the compiled JS file.
 * In Node.js/test environments this may be undefined (observer is browser-only).
 */
const PROCESSOR_URL = /* @__PURE__ */ (() => {
  try {
    return new URL('./audio-observer-processor.js', import.meta.url).href;
  } catch {
    return null;
  }
})();

/** Processor name registered in the AudioWorkletProcessor. */
const PROCESSOR_NAME = 'vestara-audio-observer';

// ─── AudioObserver Implementation ────────────────────────────

/**
 * Web Audio-based audio observer using AudioWorkletNode.
 *
 * Uses AudioWorkletNode (production API, non-deprecated) for PCM frame
 * extraction. Falls back to ScriptProcessorNode if AudioWorklet is
 * unavailable (legacy environments).
 *
 * The observer is non-destructive: conference playback continues
 * while observation is active. Classification (speech vs silence)
 * is owned by future VAD consumers.
 */
export class WebAudioObserver implements IAudioObserver {
  private _state: AudioObserverState = 'idle';
  private _callback: AudioFrameCallback | null = null;

  // Web Audio objects (created on attach, released on detach)
  private _audioContext: AudioContext | null = null;
  private _sourceNode: MediaStreamAudioSourceNode | null = null;
  private _workletNode: AudioWorkletNode | null = null;

  // Fallback for environments without AudioWorklet
  private _scriptProcessor: ScriptProcessorNode | null = null;

  // Hidden <audio> element for remote WebRTC stream activation.
  // Remote WebRTC MediaStreams require playback through a media element
  // to activate the decoding pipeline before audio data flows to the
  // Web Audio API's MediaStreamSourceNode.
  private _activationElement: HTMLAudioElement | null = null;

  // Track ended listener (to auto-detach when track ends)
  private _trackEndedHandler: (() => void) | null = null;
  private _observedTrack: MediaStreamTrack | null = null;
  private _currentStream: MediaStream | null = null;
  private _currentSourceId: string | null = null;

  get state(): AudioObserverState {
    return this._state;
  }

  /**
   * Attach to a MediaStream and begin observing its audio track.
   *
   * Non-destructive: the stream's audio continues to play through
   * the default destination while the observer taps into it.
   *
   * @param mediaStream - The MediaStream to observe
   * @param sourceId - Identifier for the audio source
   */
  attach(mediaStream: MediaStream, sourceId: string): void {
    if (this._state === 'destroyed') {
      throw new Error('AudioObserver has been destroyed');
    }

    // Detach from any current stream first
    if (this._state === 'observing') {
      this.detach();
    }

    // Find audio track
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      // No audio track — stay idle (safe no-op)
      return;
    }

    const audioTrack = audioTracks[0];

    try {
      // Create AudioContext
      this._audioContext = new AudioContext();

      // Activate remote WebRTC audio pipeline by playing through a muted
      // <audio> element. Without this, remote streams may deliver silence
      // to the MediaStreamAudioSourceNode. Local streams (from getUserMedia
      // or MediaStreamDestination) don't need this.
      this._activateAudioPipeline(mediaStream);

      // Create source from MediaStream
      this._sourceNode = this._audioContext.createMediaStreamSource(mediaStream);

      if (PROCESSOR_URL && this._audioContext.audioWorklet) {
        // Production path: AudioWorkletNode
        this._attachWithWorklet(sourceId);
      } else {
        // Fallback path: ScriptProcessorNode (deprecated but universal)
        this._attachWithScriptProcessor(sourceId);
      }

      // Listen for track ended to auto-detach
      this._trackEndedHandler = () => {
        this.detach();
      };
      this._observedTrack = audioTrack;
      audioTrack.addEventListener('ended', this._trackEndedHandler);

      // Store current stream
      this._currentStream = mediaStream;
      this._currentSourceId = sourceId;

      this._state = 'observing';
    } catch {
      // Cleanup on failure
      this._cleanupAudioResources();
    }
  }

  /**
   * Detach from the current MediaStream and stop observing.
   *
   * Releases AudioContext, nodes, and listeners.
   * Idempotent — safe to call when already detached.
   */
  detach(): void {
    if (this._state !== 'observing') return;

    // Stop the processor
    if (this._workletNode) {
      this._workletNode.port.postMessage({ type: 'stop' });
    }

    this._cleanupAudioResources();
    this._state = 'stopped';
  }

  /**
   * Register a callback for receiving audio frames.
   */
  onFrame(callback: AudioFrameCallback): void {
    this._callback = callback;
  }

  /**
   * Remove the frame callback.
   */
  offFrame(): void {
    this._callback = null;
  }

  /**
   * Destroy the observer and release all resources.
   *
   * After destroy(), the observer cannot be reused.
   */
  destroy(): void {
    this.detach();
    this._callback = null;
    this._state = 'destroyed';
  }

  // ─── Private: AudioWorklet Path ────────────────────────────

  private async _attachWithWorklet(sourceId: string): Promise<void> {
    if (!this._audioContext || !this._sourceNode || !PROCESSOR_URL) return;

    // Load the AudioWorklet processor module
    await this._audioContext.audioWorklet.addModule(PROCESSOR_URL);

    // Create the worklet node
    this._workletNode = new AudioWorkletNode(this._audioContext, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0, // We don't route output — observation only
    });

    // Handle frames from the processor
    this._workletNode.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'frame') {
        this._handleFrame(event.data, sourceId);
      }
    };

    // Connect: source → worklet
    // Worklet output is 0 channels, so it doesn't affect playback.
    this._sourceNode.connect(this._workletNode);
  }

  // ─── Private: ScriptProcessorNode Fallback ─────────────────

  /**
   * Activate the audio pipeline for remote WebRTC MediaStreams.
   *
   * Remote WebRTC streams require playback through a media element to
   * activate the browser's decoding pipeline. Without this, the
   * MediaStreamAudioSourceNode may receive silence instead of decoded
   * audio data. The element is muted to prevent audible output.
   *
   * Local streams (from getUserMedia or MediaStreamDestination) don't
   * need this — their pipeline is already active.
   */
  private _activateAudioPipeline(mediaStream: MediaStream): void {
    if (typeof document === 'undefined') return; // Node.js / SSR guard

    // Only needed for streams with audio tracks
    if (mediaStream.getAudioTracks().length === 0) return;

    try {
      this._activationElement = document.createElement('audio');
      this._activationElement.srcObject = mediaStream;
      this._activationElement.muted = true;
      this._activationElement.play().catch(() => {
        // Best-effort — may fail in some environments
      });
    } catch {
      // Best-effort — not critical for local streams
    }
  }

  private _attachWithScriptProcessor(sourceId: string): void {
    if (!this._audioContext || !this._sourceNode) return;

    const bufferSize = 4096;
    this._scriptProcessor = this._audioContext.createScriptProcessor(bufferSize, 1, 1);

    this._scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      this._handleScriptProcessorEvent(event, sourceId);
    };

    // Connect: source → processor
    // Processor output is NOT connected to destination, so playback is unaffected.
    this._sourceNode.connect(this._scriptProcessor);
  }

  // ─── Private: Frame Handling ───────────────────────────────

  private _handleFrame(
    data: { data: Float32Array; sampleRate: number; channels: number; peak: number },
    sourceId: string,
  ): void {
    if (!this._callback) return;

    const frame: AudioFrame = {
      sourceId,
      sampleRate: data.sampleRate,
      channels: data.channels,
      timestamp: performance.now(),
      peak: data.peak,
      data: data.data,
    };

    this._callback(frame);
  }

  private _handleScriptProcessorEvent(event: AudioProcessingEvent, sourceId: string): void {
    if (!this._callback) return;

    const inputBuffer = event.inputBuffer;
    const channelData = inputBuffer.getChannelData(0);

    // Compute peak amplitude
    let peak = 0;
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }

    // Create bounded PCM frame — emit ALL frames including silence.
    // Classification is owned by future VAD consumers.
    const frame: AudioFrame = {
      sourceId,
      sampleRate: inputBuffer.sampleRate,
      channels: inputBuffer.numberOfChannels,
      timestamp: performance.now(),
      peak,
      data: new Float32Array(channelData), // copy to avoid reference retention
    };

    this._callback(frame);
  }

  // ─── Private: Cleanup ──────────────────────────────────────

  private _cleanupAudioResources(): void {
    // Remove track ended listener
    if (this._observedTrack && this._trackEndedHandler) {
      this._observedTrack.removeEventListener('ended', this._trackEndedHandler);
    }
    this._observedTrack = null;
    this._trackEndedHandler = null;

    // Stop and release activation audio element
    if (this._activationElement) {
      this._activationElement.pause();
      this._activationElement.srcObject = null;
      this._activationElement = null;
    }

    // Disconnect worklet node
    if (this._workletNode) {
      this._workletNode.port.onmessage = null;
      this._workletNode.disconnect();
      this._workletNode = null;
    }

    // Disconnect script processor (fallback)
    if (this._scriptProcessor) {
      this._scriptProcessor.onaudioprocess = null;
      this._scriptProcessor.disconnect();
      this._scriptProcessor = null;
    }

    // Disconnect source
    if (this._sourceNode) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }

    // Close AudioContext
    if (this._audioContext) {
      this._audioContext.close().catch(() => {
        // Best-effort — AudioContext may already be closed
      });
      this._audioContext = null;
    }

    // Release stream references
    this._currentStream = null;
    this._currentSourceId = null;
  }
}
