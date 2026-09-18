/**
 * VES-TG-024: Telegram Telemetry
 *
 * Canonical observability for the Telegram channel. Emits the event names
 * defined by the VES-TG-001 observability contract and attaches the standard
 * correlation context (correlationId, principalId, workspaceId,
 * conversationId, executionId, channel, externalMessageId) so a Telegram turn
 * can be traced end-to-end into the Activity Room and execution runtime.
 *
 * Records are redacted before they leave the emitter: token-, secret-, and
 * key-shaped fields are dropped so credentials can never leak through a log
 * sink (TG-S7).
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-024)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { randomUUID } from 'node:crypto';

// ─── Event Names ───────────────────────────────────────────────

export type TelegramTelemetryEvent =
  | 'telegram.webhook.received'
  | 'telegram.update.duplicate'
  | 'telegram.message.normalized'
  | 'telegram.identity.resolved'
  | 'telegram.delivery.queued'
  | 'telegram.delivery.sent'
  | 'telegram.delivery.failed'
  | 'channel.message.received'
  | 'channel.action.received'
  | 'channel.delivery.requested'
  | 'channel.delivery.completed';

export const TELEGRAM_TELEMETRY_EVENTS: readonly TelegramTelemetryEvent[] = [
  'telegram.webhook.received',
  'telegram.update.duplicate',
  'telegram.message.normalized',
  'telegram.identity.resolved',
  'telegram.delivery.queued',
  'telegram.delivery.sent',
  'telegram.delivery.failed',
  'channel.message.received',
  'channel.action.received',
  'channel.delivery.requested',
  'channel.delivery.completed',
];

// ─── Types ─────────────────────────────────────────────────────

export type TelemetryChannel = 'telegram' | 'web' | 'mobile' | 'desktop' | 'cli' | 'slack' | 'discord' | 'other';

export interface CorrelationContext {
  /** Trace ID spanning channel → execution → delivery */
  readonly correlationId: string;

  /** Vestara principal (when resolved) */
  readonly principalId?: string;

  /** Workspace scope */
  readonly workspaceId?: string;

  /** Vestara conversation */
  readonly conversationId?: string;

  /** Execution identity (provenance only) */
  readonly executionId?: string;

  /** Originating/serving channel */
  readonly channel: TelemetryChannel;

  /** Telegram message ID */
  readonly externalMessageId?: string;
}

export interface TelemetryRecord {
  /** Canonical event name */
  readonly name: TelegramTelemetryEvent;

  /** ISO-8601 timestamp */
  readonly timestamp: string;

  /** Correlation context */
  readonly context: CorrelationContext;

  /** Redacted event data */
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface TelemetrySink {
  /** Receive a finalized, redacted record. Must not throw. */
  emit(record: TelemetryRecord): void;
}

export interface TelegramTelemetryConfig {
  /** Downstream sink (defaults to an in-memory buffer) */
  readonly sink?: TelemetrySink;

  /** Clock injection for deterministic tests */
  readonly now?: () => Date;

  /** Maximum buffered records when no external sink is provided */
  readonly bufferLimit?: number;
}

// ─── Redaction ─────────────────────────────────────────────────

const SENSITIVE_KEY = /(token|secret|password|credential|authorization|api[_-]?key)/i;

/**
 * Recursively redact sensitive keys from telemetry data. Never throws and
 * never mutates the input.
 */
export function redactTelemetryData(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6 || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = '[redacted]';
      continue;
    }
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      result[key] = redactTelemetryData(entry, depth + 1);
      continue;
    }
    if (Array.isArray(entry)) {
      result[key] = entry.length;
      continue;
    }
    result[key] = entry;
  }
  return result;
}

// ─── Correlation ───────────────────────────────────────────────

/**
 * Build a correlation context, generating a correlation ID when absent.
 * `channel` defaults to `telegram`.
 */
export function createCorrelationContext(
  partial: Partial<CorrelationContext> & { channel?: TelemetryChannel } = {},
): CorrelationContext {
  return {
    correlationId: partial.correlationId ?? randomUUID(),
    channel: partial.channel ?? 'telegram',
    ...(partial.principalId ? { principalId: partial.principalId } : {}),
    ...(partial.workspaceId ? { workspaceId: partial.workspaceId } : {}),
    ...(partial.conversationId ? { conversationId: partial.conversationId } : {}),
    ...(partial.executionId ? { executionId: partial.executionId } : {}),
    ...(partial.externalMessageId ? { externalMessageId: partial.externalMessageId } : {}),
  };
}

/**
 * Derive a child context that preserves the trace ID and merges new fields.
 */
export function withCorrelation(
  context: CorrelationContext,
  patch: Partial<Omit<CorrelationContext, 'correlationId' | 'channel'>>,
): CorrelationContext {
  return createCorrelationContext({ ...context, ...patch });
}

// ─── Telemetry ─────────────────────────────────────────────────

/**
 * Channel telemetry emitter. When no external sink is configured, records are
 * buffered in memory up to `bufferLimit` (newest kept) so tests and
 * diagnostics can inspect recent activity without a backend.
 */
export class TelegramTelemetry {
  private readonly sink: TelemetrySink;
  private readonly now: () => Date;
  private readonly bufferLimit: number;
  private readonly buffer: TelemetryRecord[] = [];

  constructor(config?: TelegramTelemetryConfig) {
    this.now = config?.now ?? (() => new Date());
    this.bufferLimit = config?.bufferLimit ?? 500;
    this.sink =
      config?.sink ??
      ({
        emit: (record: TelemetryRecord) => {
          this.buffer.push(record);
          while (this.buffer.length > this.bufferLimit) this.buffer.shift();
        },
      } satisfies TelemetrySink);
  }

  /**
   * Emit a telemetry record. Never throws — observability must not break the
   * message pipeline.
   */
  emit(
    name: TelegramTelemetryEvent,
    context: CorrelationContext,
    data?: Readonly<Record<string, unknown>>,
  ): TelemetryRecord {
    const record: TelemetryRecord = {
      name,
      timestamp: this.now().toISOString(),
      context,
      data: redactTelemetryData(data),
    };
    try {
      this.sink.emit(record);
    } catch {
      // A failing sink is never allowed to break delivery.
    }
    return record;
  }

  /** Recent buffered records (empty when an external sink is configured). */
  getRecords(): readonly TelemetryRecord[] {
    return [...this.buffer];
  }

  /** Records filtered by name. */
  getRecordsByName(name: TelegramTelemetryEvent): readonly TelemetryRecord[] {
    return this.buffer.filter((record) => record.name === name);
  }

  /** Drop buffered records. */
  clear(): void {
    this.buffer.length = 0;
  }
}
