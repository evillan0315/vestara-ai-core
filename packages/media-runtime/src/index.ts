/**
 * @vestara/media-runtime
 *
 * Provider-neutral media conferencing contracts and runtime.
 *
 * This package defines the Vestara domain for media sessions,
 * connections, credentials, and provider capabilities. It does NOT
 * contain any provider-specific implementations (e.g. OpenVidu).
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts → OVR-001 Remediation
 */

export type {
  MediaConnection,
  MediaConnectionEvent,
  MediaConnectionStatus,
  MediaParticipantCapabilities,
} from './media-connection';
export { MediaCapabilities } from './media-connection';
// Backward-compatible aliases (deprecated — use Credential variants)
export type {
  MediaConnectionCredential,
  MediaConnectionCredentialData,
  MediaConnectionToken,
} from './media-connection-token';
export {
  consumeMediaConnectionCredential,
  createMediaConnectionCredential,
  createMediaConnectionToken,
  inspectCredential,
  inspectToken,
  isCredentialExpired,
  isMediaConnectionCredential,
  isMediaConnectionToken,
  isTokenExpired,
  sanitizeCredentialForLogging,
  sanitizeTokenForLogging,
} from './media-connection-token';
export type { MediaErrorCode } from './media-errors';
export {
  MediaCapabilityNotSupportedError,
  MediaConnectionAlreadyActiveError,
  MediaConnectionAlreadyDisconnectedError,
  MediaConnectionNotFoundError,
  MediaError,
  MediaSessionAlreadyActiveError,
  MediaSessionAlreadyClosedError,
  MediaSessionNotFoundError,
  MediaTokenExpiredError,
} from './media-errors';
export type { MediaProviderCapabilities } from './media-provider-capabilities';
export { createProviderCapabilities } from './media-provider-capabilities';
export type {
  CreateMediaConnectionOptions,
  CreateMediaConnectionResult,
  CreateMediaSessionOptions,
  MediaServer,
} from './media-server';
export type {
  MediaSession,
  MediaSessionEvent,
  MediaSessionStatus,
} from './media-session';
