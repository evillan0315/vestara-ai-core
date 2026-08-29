import { describe, expect, it } from 'vitest';
import { normalizeFileStatus, normalizeFindMatches, normalizeSymbols } from '../src/file-normalizers';
import { normalizeMessages } from '../src/session-normalizers';

describe('file-normalizers', () => {
  it('normalizes find.text matches from snake_case upstream fields', () => {
    const raw = [
      {
        path: 'src/a.ts',
        line_number: 3,
        absolute_offset: 42,
        lines: 'export const a = 1;',
        submatches: [{ text: 'a', start: 7, end: 8 }],
      },
      { path: 'src/b.ts', filename: 'b' },
      { not: 'an object' },
    ];
    const matches = normalizeFindMatches(raw);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      path: 'src/a.ts',
      lineNumber: 3,
      absoluteOffset: 42,
      lines: 'export const a = 1;',
      submatches: [{ text: 'a', start: 7, end: 8 }],
    });
    expect(matches[1].path).toBe('src/b.ts');
  });

  it('normalizes symbols with uri + range', () => {
    const symbols = normalizeSymbols([
      { name: 'Foo', kind: 5, location: { uri: 'file:///a.ts', range: { start: { line: 0 } } } },
      { name: 'bar' },
      'junk',
    ]);
    expect(symbols).toHaveLength(2);
    expect(symbols[0].location.uri).toBe('file:///a.ts');
    expect(symbols[0].location.range).toBeDefined();
    expect(symbols[1].location.uri).toBe('');
  });

  it('normalizes file status', () => {
    const files = normalizeFileStatus([
      { path: 'a.ts', added: 2, removed: 0, status: 'modified' },
      { path: 'b.ts', added: 5, removed: 1, status: 'added' },
      { path: 'c.ts', added: 1, removed: 3, status: 'deleted' },
    ]);
    expect(files.map((f) => f.status)).toEqual(['modified', 'added', 'deleted']);
    expect(files[0].added).toBe(2);
  });
});

describe('structured output message normalization', () => {
  it('surfaces structured_output from message info', () => {
    const messages = normalizeMessages([
      {
        info: { id: 'msg1', role: 'assistant', structured_output: { company: 'Anthropic', founded: 2021 } },
        parts: [],
      },
    ]);
    expect(messages[0].structuredOutput).toEqual({ company: 'Anthropic', founded: 2021 });
  });
});
