/**
 * @vestara/media-runtime — Media Provider Capabilities
 *
 * Declares what a media provider supports. Makes unsupported deployment
 * functionality explicit without special-case checks throughout Workspace.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts
 */

/**
 * Capability flags for a media provider deployment.
 *
 * Each flag is a boolean. If a capability is unsupported, the adapter
 * reports `false`. Callers check `capabilities.recording` instead of
 * `if (openvidu && openvidu.recording)`.
 */
export interface MediaProviderCapabilities {
  /** Provider identifier (e.g. "openvidu"). */
  readonly provider: string;

  /** Provider version string (e.g. "2.25.0"). */
  readonly version: string;

  /** Whether session creation is supported. */
  readonly sessions: boolean;

  /** Whether connection creation is supported. */
  readonly connections: boolean;

  /** Whether WebRTC audio publishing/subscribing is supported. */
  readonly webrtcAudio: boolean;

  /** Whether WebRTC video publishing/subscribing is supported. */
  readonly webrtcVideo: boolean;

  /** Whether participants can publish streams. */
  readonly publish: boolean;

  /** Whether participants can subscribe to streams. */
  readonly subscribe: boolean;

  /** Whether screen sharing is supported. */
  readonly screenShare: boolean;

  /** Whether server-side recording is supported. */
  readonly recording: boolean;

  /** Whether server-side transcoding is supported. */
  readonly transcoding: boolean;

  /** Whether simulcast is supported. */
  readonly simulcast: boolean;

  /** Whether participant moderation (force-unpublish, disconnect) is supported. */
  readonly moderation: boolean;

  /** Whether the provider supports custom session/connection metadata. */
  readonly metadata: boolean;

  /** Additional provider-specific capability flags. */
  readonly extensions?: Record<string, boolean>;
}

/**
 * Creates a MediaProviderCapabilities with sensible defaults.
 * Override specific flags as needed for each provider.
 */
export function createProviderCapabilities(
  provider: string,
  version: string,
  overrides?: Partial<Omit<MediaProviderCapabilities, 'provider' | 'version'>>,
): MediaProviderCapabilities {
  return {
    provider,
    version,
    sessions: true,
    connections: true,
    webrtcAudio: true,
    webrtcVideo: true,
    publish: true,
    subscribe: true,
    screenShare: false,
    recording: false,
    transcoding: false,
    simulcast: false,
    moderation: false,
    metadata: false,
    ...overrides,
  };
}
