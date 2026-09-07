/**
 * @vestara/media-conference
 *
 * Browser-side media conference client, types, provider-neutral adapter,
 * and non-destructive audio observation.
 *
 * This package provides the runtime layer for browser media conferencing.
 * React presentation components live in the consuming application
 * (e.g., apps/workspace/src/components/media/).
 *
 * Architecture:
 *   React → useMediaConference → MediaConferenceClient → BrowserAdapter → provider SDK
 *   MediaStream → AudioObserver → normalized PCM frames → future consumers (VAD, STT)
 *
 * Ownership:
 *   Media Conference: connection lifecycle, MediaStreams, camera/mic state,
 *     publisher/subscriber normalization, participant media presentation
 *   Audio Observer: non-destructive audio observation, PCM frame extraction
 *   Host integration: identity, authorization, binding correlation
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference → OVR-007 Audio Observation
 */

// ─── Conference Types ────────────────────────────────────────

export type {
  BrowserAdapter,
  BrowserAdapterEvents,
  MediaConferenceClientEvents,
  MediaConferenceContext,
  MediaConferenceParticipant,
  MediaConferenceSnapshot,
  MediaConferenceState,
  PublisherHandle,
  SubscriberHandle,
} from './types.js';

// ─── Conference Client ───────────────────────────────────────

export { MediaConferenceClient } from './media-conference-client.js';

// ─── Browser Adapter ─────────────────────────────────────────

export { OpenViduBrowserAdapter } from './openvidu-browser-adapter.js';

// ─── Audio Observer Types ────────────────────────────────────

export type {
  AudioFrame,
  AudioFrameCallback,
  AudioObserver,
  AudioObserverState,
} from './audio-observer-types.js';

// ─── Audio Observer Implementation ───────────────────────────

export { WebAudioObserver } from './audio-observer.js';
