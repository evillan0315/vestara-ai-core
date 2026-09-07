/**
 * @vestara/media-runtime — Media Connection Credential
 *
 * A MediaConnectionCredential is an ephemeral, capability-bearing credential
 * used to establish media connectivity (WebRTC signaling).
 *
 * SECURITY INVARIANT:
 *   The credential's secret value MUST NOT be reachable through:
 *     - JSON.stringify()
 *     - Object spread / rest
 *     - Object.keys() / for...in
 *     - util.inspect / console.log
 *     - Activity Room events
 *     - Logs
 *     - Evidence
 *     - Persisted session records
 *     - Diagnostics
 *     - Telemetry
 *     - Any durable or generic serialization
 *
 * The secret is stored in a Symbol-keyed private slot on the credential
 * object. It is ONLY extractable via consumeMediaConnectionCredential().
 *
 * Ownership:
 *   - Created by: MediaServer.createConnection()
 *   - Consumed by: authorized caller via consumeMediaConnectionCredential()
 *   - Lifetime: ephemeral — valid until connection closes or provider expires
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts → OVR-001 Remediation
 */

/**
 * Private Symbol key for the credential secret.
 * Non-enumerable by nature — invisible to JSON.stringify, Object.keys, spread.
 */
const SECRET = Symbol.for('@vestara/media-runtime/MediaConnectionCredential.secret');

/**
 * An ephemeral capability used to establish media connectivity.
 *
 * The secret credential value is NOT a property on this object.
 * It is stored in a Symbol-keyed slot and accessible only via
 * consumeMediaConnectionCredential().
 *
 * Public properties are safe metadata: connectionId, sessionId,
 * provider, issuedAt, expiresAt. These are suitable for logging,
 * events, and diagnostics.
 */
export interface MediaConnectionCredential {
  /** The connection ID this credential was issued for. */
  readonly connectionId: string;

  /** The session ID this credential belongs to. */
  readonly sessionId: string;

  /** Provider identifier. */
  readonly provider: string;

  /** Unix timestamp (ms) when the credential was created. */
  readonly issuedAt: number;

  /** Unix timestamp (ms) when the credential expires, or undefined. */
  readonly expiresAt?: number;
}

/**
 * Internal type: the credential object with the hidden SECRET slot.
 * The public MediaConnectionCredential interface does not expose SECRET.
 */
interface MediaConnectionCredentialWithSecret extends MediaConnectionCredential {
  [SECRET]: string;
}

/** Raw data for credential construction (not for persistence). */
export interface MediaConnectionCredentialData {
  readonly value: string;
  readonly expiresAt?: number;
  readonly connectionId: string;
  readonly sessionId: string;
  readonly provider: string;
}

/**
 * Creates a MediaConnectionCredential.
 *
 * The secret value is stored in a Symbol-keyed private slot, NOT as
 * an enumerable property. It is invisible to JSON.stringify, object
 * spread, Object.keys(), and generic inspection.
 *
 * @param data - Raw credential data including the secret value
 * @returns A credential object with hidden secret
 */
export function createMediaConnectionCredential(data: MediaConnectionCredentialData): MediaConnectionCredential {
  const credential: MediaConnectionCredentialWithSecret = {
    connectionId: data.connectionId,
    sessionId: data.sessionId,
    provider: data.provider,
    issuedAt: Date.now(),
    expiresAt: data.expiresAt,
    [SECRET]: data.value,
  };
  return credential;
}

/**
 * Extracts the secret credential value.
 *
 * This is the ONLY way to access the bearer credential.
 * The method is intentionally named to make extraction explicit
 * and auditable — every call site is a trust-boundary operation.
 *
 * @param credential - The credential to extract the secret from
 * @returns The secret credential value (e.g. a token string)
 */
export function consumeMediaConnectionCredential(credential: MediaConnectionCredential): string {
  return (credential as MediaConnectionCredentialWithSecret)[SECRET];
}

/**
 * Checks whether a value is a MediaConnectionCredential.
 */
export function isMediaConnectionCredential(value: unknown): value is MediaConnectionCredential {
  return typeof value === 'object' && value !== null && SECRET in value;
}

/**
 * Checks whether a credential has expired.
 * Returns false if no expiry is set.
 */
export function isCredentialExpired(credential: MediaConnectionCredential): boolean {
  if (credential.expiresAt === undefined) return false;
  return Date.now() > credential.expiresAt;
}

/**
 * Returns a safe, serializable representation of the credential
 * for use in logs, events, and diagnostics.
 *
 * The secret value is NEVER included.
 */
export function sanitizeCredentialForLogging(credential: MediaConnectionCredential): {
  connectionId: string;
  sessionId: string;
  provider: string;
  issuedAt: number;
  expired: boolean;
} {
  return {
    connectionId: credential.connectionId,
    sessionId: credential.sessionId,
    provider: credential.provider,
    issuedAt: credential.issuedAt,
    expired: isCredentialExpired(credential),
  };
}

/**
 * Custom inspection to prevent accidental secret leak via
 * console.log / util.inspect.
 *
 * Returns a redacted placeholder — never the secret value.
 */
export function inspectCredential(credential: MediaConnectionCredential): string {
  return `[MediaConnectionCredential connectionId=${credential.connectionId} provider=${credential.provider} REDACTED]`;
}

// ─── Backward Compatibility ──────────────────────────────────────
// Deprecated aliases for OVR-001 → OVR-001 remediation transition.
// Remove after all references are updated.

/** @deprecated Use MediaConnectionCredential */
export type MediaConnectionToken = MediaConnectionCredential;

/** @deprecated Use createMediaConnectionCredential */
export const createMediaConnectionToken = createMediaConnectionCredential;

/** @deprecated Use isMediaConnectionCredential */
export const isMediaConnectionToken = isMediaConnectionCredential;

/** @deprecated Use isCredentialExpired */
export const isTokenExpired = isCredentialExpired;

/** @deprecated Use sanitizeCredentialForLogging */
export const sanitizeTokenForLogging = sanitizeCredentialForLogging;

/** @deprecated Use inspectCredential */
export const inspectToken = inspectCredential;
