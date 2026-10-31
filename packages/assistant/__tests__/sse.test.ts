import { describe, expect, it } from 'vitest';
import { parseStreamFrames } from '../src/sse';

const frame = (event: unknown) => `data: ${JSON.stringify({ schemaVersion: 1, event })}\n\n`;

describe('parseStreamFrames', () => {
  it('parses delta/tool/status frames and returns the incomplete tail', () => {
    const buffer =
      frame({ type: 'delta', content: 'hello ' }) +
      frame({ type: 'tool', name: 'read', execution: { kind: 'tool', operationId: 'op-1' } }) +
      'data: {"schemaVersion":1,"event":{"type":"delta","content":"par';
    const { frames, rest } = parseStreamFrames(buffer);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.event?.type).toBe('delta');
    expect(frames[1]?.event?.name).toBe('read');
    expect(frames[1]?.event?.execution).toEqual({ kind: 'tool', operationId: 'op-1' });
    expect(rest).toContain('par');
  });

  it('skips malformed frames without killing the turn', () => {
    const { frames, rest } = parseStreamFrames('data: not-json\n\n' + frame({ type: 'done' }));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event?.type).toBe('done');
    expect(rest).toBe('');
  });

  it('ignores non-data lines and preserves unknown event types', () => {
    const { frames } = parseStreamFrames(
      ': keep-alive\n' + frame({ type: 'permission', content: 'Waiting', execution: { kind: 'permission' } }),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event?.type).toBe('permission');
  });

  it('returns empty frames for an empty buffer', () => {
    expect(parseStreamFrames('')).toEqual({ frames: [], rest: '' });
  });
});
