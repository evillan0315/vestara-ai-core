/**
 * @vestara/media-runtime — Media Errors
 *
 * Provider-neutral error types for media operations.
 * Each error carries a `code` for programmatic matching and
 * a human-readable `message`. Provider-specific details are
 * available via `providerDetail` (opaque, not in logs).
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts
 */

export type MediaErrorCode =
  | 'MEDIA_SESSION_NOT_FOUND'
  | 'MEDIA_SESSION_ALREADY_ACTIVE'
  | 'MEDIA_SESSION_ALREADY_CLOSED'
  | 'MEDIA_SESSION_CREATION_FAILED'
  | 'MEDIA_CONNECTION_NOT_FOUND'
  | 'MEDIA_CONNECTION_ALREADY_ACTIVE'
  | 'MEDIA_CONNECTION_ALREADY_DISCONNECTED'
  | 'MEDIA_CONNECTION_CREATION_FAILED'
  | 'MEDIA_TOKEN_EXPIRED'
  | 'MEDIA_TOKEN_INVALID'
  | 'MEDIA_CAPABILITY_NOT_SUPPORTED'
  | 'MEDIA_PROVIDER_UNAVAILABLE'
  | 'MEDIA_PROVIDER_AUTH_FAILED'
  | 'MEDIA_PROVIDER_TIMEOUT'
  | 'MEDIA_PROVIDER_REJECTED';

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly provider?: string;
  readonly providerDetail?: unknown;

  constructor(
    code: MediaErrorCode,
    message: string,
    options?: {
      provider?: string;
      providerDetail?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'MediaError';
    this.code = code;
    this.provider = options?.provider;
    this.providerDetail = options?.providerDetail;
  }
}

export class MediaSessionNotFoundError extends MediaError {
  constructor(sessionId: string, provider?: string) {
    super('MEDIA_SESSION_NOT_FOUND', `Media session not found: ${sessionId}`, { provider });
    this.name = 'MediaSessionNotFoundError';
  }
}

export class MediaSessionAlreadyActiveError extends MediaError {
  constructor(sessionId: string, provider?: string) {
    super('MEDIA_SESSION_ALREADY_ACTIVE', `Media session already active: ${sessionId}`, { provider });
    this.name = 'MediaSessionAlreadyActiveError';
  }
}

export class MediaSessionAlreadyClosedError extends MediaError {
  constructor(sessionId: string, provider?: string) {
    super('MEDIA_SESSION_ALREADY_CLOSED', `Media session already closed: ${sessionId}`, { provider });
    this.name = 'MediaSessionAlreadyClosedError';
  }
}

export class MediaConnectionNotFoundError extends MediaError {
  constructor(connectionId: string, provider?: string) {
    super('MEDIA_CONNECTION_NOT_FOUND', `Media connection not found: ${connectionId}`, { provider });
    this.name = 'MediaConnectionNotFoundError';
  }
}

export class MediaConnectionAlreadyActiveError extends MediaError {
  constructor(connectionId: string, provider?: string) {
    super('MEDIA_CONNECTION_ALREADY_ACTIVE', `Media connection already active: ${connectionId}`, { provider });
    this.name = 'MediaConnectionAlreadyActiveError';
  }
}

export class MediaConnectionAlreadyDisconnectedError extends MediaError {
  constructor(connectionId: string, provider?: string) {
    super('MEDIA_CONNECTION_ALREADY_DISCONNECTED', `Media connection already disconnected: ${connectionId}`, {
      provider,
    });
    this.name = 'MediaConnectionAlreadyDisconnectedError';
  }
}

export class MediaTokenExpiredError extends MediaError {
  constructor(connectionId: string, provider?: string) {
    super('MEDIA_TOKEN_EXPIRED', `Media token expired for connection: ${connectionId}`, { provider });
    this.name = 'MediaTokenExpiredError';
  }
}

export class MediaCapabilityNotSupportedError extends MediaError {
  constructor(capability: string, provider?: string) {
    super('MEDIA_CAPABILITY_NOT_SUPPORTED', `Capability not supported: ${capability}`, { provider });
    this.name = 'MediaCapabilityNotSupportedError';
  }
}
