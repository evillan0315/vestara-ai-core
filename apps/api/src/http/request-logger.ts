/**
 * Structured NDJSON request logging.
 *
 * Emits newline-delimited JSON for request lifecycle events. All sensitive
 * values are redacted before serialization. The logger is kept free of any
 * dependency on global state other than the active request context.
 */

import { requestContext } from './request-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  event: string;
  [key: string]: unknown;
}

export interface RequestLoggerOptions {
  level?: LogLevel;
  out?: (line: string) => void;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'xapikey',
  'apikey',
  'xvestaratoken',
  'token',
  'password',
  'passwd',
  'secret',
  'clientsecret',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apitoken',
]);

const REDACTED = '[REDACTED]';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

function redactRecord(record: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 6) return { __redacted: true } as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        out[key] = value.map((item) =>
          item !== null && typeof item === 'object' ? redactRecord(item as Record<string, unknown>, depth + 1) : item,
        );
      } else {
        out[key] = redactRecord(value as Record<string, unknown>, depth + 1);
      }
    } else if (typeof value === 'string') {
      out[key] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export class RequestLogger {
  private readonly levelRank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  private readonly minimum: number;
  private readonly out: (line: string) => void;

  constructor(options: RequestLoggerOptions = {}) {
    this.minimum = this.levelRank[options.level ?? 'debug'];
    this.out = options.out ?? ((line) => process.stdout.write(`${line}\n`));
  }

  isEnabled(level: LogLevel): boolean {
    return this.levelRank[level] >= this.minimum;
  }

  log(level: LogLevel, fields: LogFields): void {
    if (!this.isEnabled(level)) return;
    const ctx = requestContext.current(false);
    const record: Record<string, unknown> = {
      level,
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      ...fields,
    };
    const redacted = redactRecord(record);
    try {
      this.out(JSON.stringify(redacted));
    } catch {
      // Never allow a logging failure to crash request processing.
      try {
        this.out(JSON.stringify({ level, event: fields.event, requestId: ctx.requestId, redactionFailure: true }));
      } catch {
        /* ignore */
      }
    }
  }

  debug(fields: LogFields): void {
    this.log('debug', fields);
  }

  info(fields: LogFields): void {
    this.log('info', fields);
  }

  warn(fields: LogFields): void {
    this.log('warn', fields);
  }

  error(fields: LogFields): void {
    this.log('error', fields);
  }
}

export const logger = new RequestLogger();

/** Redact sensitive values for diagnostic payloads or debug output. */
export function redactSensitive(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'object') {
    return Array.isArray(input)
      ? input.map((item) => redactSensitive(item))
      : redactRecord(input as Record<string, unknown>);
  }
  return input;
}
