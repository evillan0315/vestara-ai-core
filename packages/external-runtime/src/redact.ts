/**
 * Centralized recursive secret redaction.
 *
 * Applied at every boundary before persistence, logging, telemetry, graph
 * insertion, API output, WebSocket publication, UI state, and evidence.
 */

const SENSITIVE_KEY =
  /token|access[-_]?token|refresh[-_]?token|api[-_]?key|secret|password|authorization|cookie|credential|private[-_]?key|client[-_]?secret|session[-_]?token|oauth/i;

const SENSITIVE_VALUE = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
];

const REDACTED = '[REDACTED]';

/** True when a key should be redacted regardless of value. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Redact a single scalar string value when it looks like a secret. */
export function redactValue(value: string): string {
  let out = value;
  for (const re of SENSITIVE_VALUE) out = out.replace(re, REDACTED);
  // Embedded URL credentials (https://user:pass@host)
  out = out.replace(/\/\/([^/@\s]+):([^/@\s]+)@/g, '//[REDACTED]:[REDACTED]@');
  return out === value ? value : out;
}

/**
 * Recursively redact credentials in any JSON-serializable structure.
 * Sensitive keys are masked; secret-looking string values are scrubbed.
 * `allowedKeys` preserves non-secret metadata on sensitive objects.
 */
export function redact<T>(input: T, allowedKeys: readonly string[] = []): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return redactValue(input) as unknown as T;
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) return input.map((item) => redact(item, allowedKeys)) as unknown as T;
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        if (allowedKeys.includes(key)) {
          out[key] = redact(value, allowedKeys);
        } else {
          out[key] = value === null || value === undefined ? value : REDACTED;
        }
      } else {
        out[key] = redact(value, allowedKeys);
      }
    }
    return out as unknown as T;
  }
  return input;
}

/** Preserve configured-boolean metadata while redacting the credential value. */
export function redactCredential(entry: {
  provider?: string;
  configured?: boolean;
  credentialSource?: string;
  [key: string]: unknown;
}): Record<string, unknown> {
  const { configured, credentialSource, provider, ...rest } = entry;
  const redactedRest = redact(rest, []);
  return {
    ...(provider !== undefined ? { provider } : {}),
    ...(configured !== undefined ? { configured } : {}),
    ...(credentialSource !== undefined ? { credentialSource } : {}),
    ...redactedRest,
  };
}

/** Redact an environment reference, never the value. */
export function redactEnvironment(env: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = value === undefined ? '[unset]' : REDACTED;
  }
  return out;
}

/** True if the redacted output differs from the input (i.e. something was masked). */
export function wasRedacted(input: unknown): boolean {
  return JSON.stringify(input) !== JSON.stringify(redact(input));
}
