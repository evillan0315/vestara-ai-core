/**
 * @vestara/media-conference — Media Conference Types
 *
 * Provider-neutral types for browser-side media conferencing.
 * These types describe the normalized state that React components
 * consume — no OpenVidu, Twilio, or provider-specific types leak here.
 *
 * Ownership:
 *   Media Conference owns: connection state, local/remote MediaStreams,
 *     publisher/subscriber normalization, camera/mic state
 *   Host integration owns: identity, authorization, binding correlation
 *
 * Credential Boundary:
 *   This module NEVER persists, emits, or logs connection credentials,
 *   tokens, secrets, or MediaStream state.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

// ─── Connection Context ──────────────────────────────────────

/**
 * Provider-neutral connection context.
 *
 * Represents everything needed to join a media session.
 * Host integrations (Activity Room, Meeting Page, Agent Room)
 * construct this from their own authority and pass it to
 * MediaConference.
 *
 * No Activity Room-specific fields. No provider-specific fields.
 * This is the narrow integration contract.
 */
export interface MediaConferenceContext {
  /** The media session/server URL (e.g. "https://viduk.swinglifestyle.com"). */
  readonly serverUrl: string;

  /** The session ID to connect to. */
  readonly sessionId: string;

  /**
   * The ephemeral credential for connection.
   * Obtained through the host's authorized join operation.
   * Consumed once during connect, then discarded.
   */
  readonly credential: string;

  /** Display name for the local participant. */
  readonly displayName: string;

  /** Whether to publish audio on join. Defaults to true. */
  readonly publishAudio?: boolean;

  /** Whether to publish video on join. Defaults to true. */
  readonly publishVideo?: boolean;
}

// ─── Connection State ────────────────────────────────────────

/** Connection state of the media conference client. */
export type MediaConferenceState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

// ─── Participant ─────────────────────────────────────────────

/** Normalized participant state for UI consumption. */
export interface MediaConferenceParticipant {
  /** Unique participant identifier. */
  readonly id: string;

  /** Display name (from clientData or participant metadata). */
  readonly displayName: string;

  /** Whether this is the local participant. */
  readonly local: boolean;

  /** Connection state. */
  readonly connectionState: 'connecting' | 'connected' | 'disconnected';

  /** Whether audio is enabled (publishing). */
  readonly audioEnabled: boolean;

  /** Whether video is enabled (publishing). */
  readonly videoEnabled: boolean;

  /**
   * The native MediaStream, if available.
   * Ephemeral — exists in browser UI state only.
   * Never persisted, serialized, or emitted to EventBus.
   */
  readonly mediaStream: MediaStream | null;
}

// ─── Normalized State ────────────────────────────────────────

/** Normalized media conference state for UI consumption. */
export interface MediaConferenceSnapshot {
  /** Current connection state. */
  readonly state: MediaConferenceState;

  /** All participants (local + remote). */
  readonly participants: readonly MediaConferenceParticipant[];

  /** The local participant, if connected. */
  readonly localParticipant: MediaConferenceParticipant | null;

  /** Remote participants. */
  readonly remoteParticipants: readonly MediaConferenceParticipant[];

  /** Whether camera is enabled locally. */
  readonly cameraEnabled: boolean;

  /** Whether microphone is enabled locally. */
  readonly microphoneEnabled: boolean;

  /** Error message, if state is "failed". */
  readonly error: string | null;
}

// ─── Client Events ───────────────────────────────────────────

/** Events emitted by the MediaConferenceClient. */
export interface MediaConferenceClientEvents {
  /** Connection state changed. */
  onStateChange?: (state: MediaConferenceState) => void;

  /** Participants list changed. */
  onParticipantsChange?: (participants: readonly MediaConferenceParticipant[]) => void;

  /** Camera enabled/disabled. */
  onCameraChange?: (enabled: boolean) => void;

  /** Microphone enabled/disabled. */
  onMicrophoneChange?: (enabled: boolean) => void;

  /** Error occurred. */
  onError?: (error: string) => void;
}

// ─── Browser Adapter Contract ────────────────────────────────

/** Handle returned by adapter.publish(). */
export interface PublisherHandle {
  /** The native MediaStream from the publisher. */
  readonly mediaStream: MediaStream | null;

  /** Toggle video on/off. */
  publishVideo(enabled: boolean): void;

  /** Toggle audio on/off. */
  publishAudio(enabled: boolean): void;

  /** Destroy the publisher. */
  destroy(): void;
}

/** Handle returned by adapter.subscribe(). */
export interface SubscriberHandle {
  /** The stream ID. */
  readonly streamId: string;

  /** The connection ID of the remote participant. */
  readonly connectionId: string;

  /** The display name of the remote participant. */
  readonly displayName: string;

  /** Whether audio is active on this stream. */
  readonly audioActive: boolean;

  /** Whether video is active on this stream. */
  readonly videoActive: boolean;

  /** The native MediaStream, if available. */
  readonly mediaStream: MediaStream | null;

  /** Destroy the subscriber. */
  destroy(): void;
}

/** Events emitted by the browser adapter. */
export interface BrowserAdapterEvents {
  /** A remote stream was created (participant joined). */
  onRemoteStreamCreated?: (subscriber: SubscriberHandle) => void;

  /** A remote stream was destroyed (participant left). */
  onRemoteStreamDestroyed?: (streamId: string, connectionId: string) => void;

  /** The session was disconnected (e.g., force disconnect). */
  onSessionDisconnected?: () => void;

  /** An error occurred. */
  onError?: (error: string) => void;
}

/**
 * Provider-neutral browser adapter interface.
 *
 * Abstracts the browser-side media SDK (openvidu-browser, twilio-video, etc.).
 * The MediaConferenceClient depends only on this interface — never on
 * a specific provider's browser SDK.
 *
 * Implementations:
 *   - OpenViduBrowserAdapter (wraps openvidu-browser)
 *   - (future) TwilioBrowserAdapter, LiveKitBrowserAdapter, etc.
 */
export interface BrowserAdapter {
  /** Connect to a media session. */
  connect(url: string, token: string): Promise<void>;

  /** Disconnect from the session. */
  disconnect(): void;

  /** Publish local media. */
  publish(options: {
    audioSource?: MediaStreamTrack | false;
    videoSource?: MediaStreamTrack | false;
    publishAudio: boolean;
    publishVideo: boolean;
  }): Promise<PublisherHandle>;

  /** Unpublish local media. */
  unpublish(): void;

  /** Subscribe to a remote stream. */
  subscribe(streamId: string): Promise<SubscriberHandle>;

  /** Unsubscribe from a remote stream. */
  unsubscribe(streamId: string): void;

  /** Register event handlers. */
  on(events: BrowserAdapterEvents): void;

  /** Destroy the adapter and release all resources. */
  destroy(): void;
}
