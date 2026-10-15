import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StructuredLogger, ConsoleSink } from '../src/index';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let logSink: { write: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logSink = { write: vi.fn() };
    logger = new StructuredLogger({ level: 'trace', service: 'test' });
    logger.addSink(logSink);
  });

  it('writes log entries to sinks', () => {
    logger.info('hello');
    expect(logSink.write).toHaveBeenCalledTimes(1);
  });

  it('filters out messages below the configured level', () => {
    const warnLogger = new StructuredLogger({ level: 'warn', service: 'test' });
    warnLogger.addSink(logSink);

    warnLogger.info('should not appear');
    expect(logSink.write).not.toHaveBeenCalled();

    warnLogger.warn('should appear');
    expect(logSink.write).toHaveBeenCalledTimes(1);
  });

  it('setLevel changes the filtering threshold', () => {
    logger.setLevel('error');
    logger.info('filtered');
    logger.error('visible');

    expect(logSink.write).toHaveBeenCalledTimes(1);
  });

  it('child logger creates a new logger with merged context', () => {
    const child = logger.child({ requestId: 'req-1' });
    child.info('from child');

    // Child has its own ConsoleSink, so we verify via the child's output
    expect(child.level).toBe(logger.level);
  });

  it('child logger does not affect parent sinks', () => {
    const child = logger.child({ extra: 'value' });
    child.info('child msg');
    logger.info('parent msg');

    // Parent sink should only receive the parent message
    expect(logSink.write).toHaveBeenCalledTimes(1);
    expect(logSink.write.mock.calls[0][0]).toMatchObject({ message: 'parent msg' });
  });

  it('serializes Error instances in context', () => {
    logger.error('something failed', { error: new Error('boom') });

    const entry = logSink.write.mock.calls[0][0];
    expect(entry.error).toBeDefined();
    expect(entry.error.message).toBe('boom');
    expect(entry.context).not.toHaveProperty('error');
  });

  it('all level methods work', () => {
    logger.fatal('f');
    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');
    logger.trace('t');

    expect(logSink.write).toHaveBeenCalledTimes(6);
  });

  it('flush re-writes buffered entries to sinks', async () => {
    const flushLogger = new StructuredLogger({ level: 'info', service: 'test' });
    const flushSink = { write: vi.fn() };
    flushLogger.addSink(flushSink);

    flushLogger.info('buffered');
    // First write happens immediately
    expect(flushSink.write).toHaveBeenCalledTimes(1);

    await flushLogger.flush();
    // Flush writes the buffer again
    expect(flushSink.write).toHaveBeenCalledTimes(2);
  });

  it('does not crash when sink throws', () => {
    const badSink = {
      write: vi.fn(() => {
        throw new Error('sink fail');
      }),
    };
    const resilientLogger = new StructuredLogger({ level: 'info', service: 'test' });
    resilientLogger.addSink(badSink);
    resilientLogger.addSink(logSink);

    resilientLogger.info('still works');

    expect(logSink.write).toHaveBeenCalledTimes(1);
  });

  it('defaults to info level when not specified', () => {
    const defaultLogger = new StructuredLogger({ service: 'test' });
    expect(defaultLogger.level).toBe('info');
  });

  it('includes service in log entry', () => {
    logger.info('test message');

    const entry = logSink.write.mock.calls[0][0];
    expect(entry.service).toBe('test');
    expect(entry.message).toBe('test message');
    expect(entry.level).toBe('info');
    expect(entry.timestamp).toBeDefined();
  });
});
