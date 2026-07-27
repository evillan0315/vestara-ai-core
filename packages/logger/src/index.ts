/**
 * @vestara/logger — Structured Logger
 *
 * Structured JSON logging with levels, console sink, and runtime
 * level configuration. Implements the Logger interface from the
 * Universal Interface Specification.
 *
 * Architecture Traceability:
 *   Runtime: LOGGING-ARCHITECTURE.md
 *   Foundation: UNIVERSAL-INTERFACE.md → Logger
 */

import type { LogEntry, LogLevel } from '@vestara/shared';

const LOG_LEVELS: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

export interface Logger {
  readonly level: LogLevel;

  fatal(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown> & { error?: Error }): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;

  child(context: Record<string, unknown>): Logger;
  setLevel(level: LogLevel): void;
  flush(): Promise<void>;
}

export class StructuredLogger implements Logger {
  private _level: LogLevel;
  private baseContext: Record<string, unknown>;
  private sinks: LogSink[] = [];
  private buffer: LogEntry[] = [];

  constructor(options?: {
    level?: LogLevel;
    service?: string;
    context?: Record<string, unknown>;
  }) {
    this._level = options?.level ?? 'info';
    this.baseContext = {
      service: options?.service ?? 'vestara',
      ...options?.context,
    };
    this.addSink(new ConsoleSink());
  }

  get level(): LogLevel {
    return this._level;
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  setLevel(level: LogLevel): void {
    this._level = level;
  }

  fatal(message: string, context?: Record<string, unknown> & { error?: Error }): void {
    this.write('fatal', message, context);
  }

  error(message: string, context?: Record<string, unknown> & { error?: Error }): void {
    this.write('error', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.write('trace', message, context);
  }

  child(context: Record<string, unknown>): Logger {
    return new StructuredLogger({
      level: this._level,
      context: { ...this.baseContext, ...context },
    });
  }

  async flush(): Promise<void> {
    const entries = this.buffer;
    this.buffer = [];
    for (const entry of entries) {
      for (const sink of this.sinks) {
        try {
          sink.write(entry);
        } catch {
          // Sink failure should not crash the logger
        }
      }
    }
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown> & { error?: Error }): void {
    if (LOG_LEVELS[level] > LOG_LEVELS[this._level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.baseContext.service as string,
      context: {
        ...this.baseContext,
        ...context,
      },
    };

    if (context?.error instanceof Error) {
      entry.error = {
        name: context.error.name,
        message: context.error.message,
        stack: context.error.stack,
      };
      delete (entry.context as Record<string, unknown>).error;
    }

    this.buffer.push(entry);

    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch {
        // Sink failure should not crash the logger
      }
    }
  }
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export class ConsoleSink implements LogSink {
  write(entry: LogEntry): void {
    const formatted = JSON.stringify(entry);

    switch (entry.level) {
      case 'fatal':
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'info':
        console.log(formatted);
        break;
      case 'debug':
      case 'trace':
        console.debug(formatted);
        break;
    }
  }
}

export class FileSink implements LogSink {
  private path: string;
  private stream?: Promise<import('node:fs').WriteStream>;

  constructor(path: string) {
    this.path = path;
  }

  write(entry: LogEntry): void {
    if (!this.stream) {
      this.stream = this.openStream();
    }
    this.stream.then((stream) => {
      stream.write(`${JSON.stringify(entry)}\n`);
    });
  }

  private async openStream(): Promise<import('node:fs').WriteStream> {
    const fs = await import('node:fs');
    return fs.createWriteStream(this.path, { flags: 'a' });
  }
}
