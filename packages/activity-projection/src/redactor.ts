import type { ActivityRecord } from './contracts';

/**
 * Redaction policy for activity records. Redaction runs before persistence and
 * before any broadcast so sensitive values never reach the Workspace.
 */
export interface RedactionPolicy {
  /** Payload keys whose values are always replaced wholesale. */
  readonly sensitiveKeys: readonly string[];
  /** Patterns matched against string values (substring replace). */
  readonly sensitivePatterns: readonly RegExp[];
  readonly replacement: string;
}

const PRIVATE_KEY_PATTERN = /-----BEGIN[ A-Z]+PRIVATE KEY-----[\s\S]*?-----END[ A-Z]+PRIVATE KEY-----/;

export const DEFAULT_REDACTION_POLICY: RedactionPolicy = {
  sensitiveKeys: [
    'apikey',
    'api_key',
    'authorization',
    'bearer',
    'token',
    'access_token',
    'refresh_token',
    'password',
    'passwd',
    'secret',
    'client_secret',
    'clientsecret',
    'credential',
    'credentials',
    'privatekey',
    'private_key',
    'accesskey',
    'access_key',
    'secretkey',
    'secret_key',
    'sessionkey',
    'session_key',
    'cookie',
    'ssh_private_key',
  ],
  sensitivePatterns: [
    /sk-[A-Za-z0-9_-]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /Bearer\s+[A-Za-z0-9._~+/=-]+/i,
    /Basic\s+[A-Za-z0-9+/=]+/i,
    PRIVATE_KEY_PATTERN,
  ],
  replacement: '[REDACTED]',
};

/** Deep-copies an activity record and replaces sensitive values in place. */
export class ActivityRedactor {
  private readonly policy: RedactionPolicy;

  constructor(policy: RedactionPolicy = DEFAULT_REDACTION_POLICY) {
    this.policy = policy;
  }

  /** Returns a new, redacted copy of the record. The input is never mutated. */
  redact(record: ActivityRecord): ActivityRecord {
    return this.redactValue(record) as ActivityRecord;
  }

  isRedacted(value: string): boolean {
    return value === this.policy.replacement;
  }

  private redactValue(value: unknown, key?: string): unknown {
    if (typeof value === 'string') return this.redactString(value, key);
    if (Array.isArray(value)) return value.map((entry) => this.redactValue(entry));
    if (value !== null && typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(value)) {
        output[entryKey] = this.redactValue(entryValue, entryKey);
      }
      return output;
    }
    return value;
  }

  private redactString(value: string, key?: string): string {
    if (key && this.policy.sensitiveKeys.includes(key.toLowerCase())) return this.policy.replacement;
    let redacted = value;
    for (const pattern of this.policy.sensitivePatterns) {
      redacted = redacted.replace(pattern, this.policy.replacement);
    }
    return redacted;
  }
}
