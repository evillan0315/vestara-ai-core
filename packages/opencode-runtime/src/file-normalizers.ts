import type {
  OpenCodeFileChange,
  OpenCodeFileChangeStatus,
  OpenCodeFindMatch,
  OpenCodeSymbol,
} from './client/opencode-types';

// Pure normalization helpers for OpenCode file/find endpoints. Renderer-free
// and unit-testable without an upstream server.

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

/** Normalize `find.text` matches (upstream uses snake_case line_number/absolute_offset). */
export function normalizeFindMatches(raw: unknown): OpenCodeFindMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((match) => {
      const submatches = Array.isArray(match.submatches)
        ? match.submatches.filter(isRecord).map((sub) => ({
            text: typeof sub.text === 'string' ? (sub.text as string) : undefined,
            start: typeof sub.start === 'number' ? (sub.start as number) : undefined,
            end: typeof sub.end === 'number' ? (sub.end as number) : undefined,
          }))
        : undefined;
      return {
        path: typeof match.path === 'string' ? (match.path as string) : String(match.filename ?? ''),
        lines: typeof match.lines === 'string' ? (match.lines as string) : undefined,
        lineNumber: typeof match.line_number === 'number' ? (match.line_number as number) : undefined,
        absoluteOffset: typeof match.absolute_offset === 'number' ? (match.absolute_offset as number) : undefined,
        submatches,
      };
    })
    .filter((match) => match.path.length > 0);
}

export function normalizeSymbols(raw: unknown): OpenCodeSymbol[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((symbol) => {
    const location = isRecord(symbol.location) ? symbol.location : {};
    return {
      name: typeof symbol.name === 'string' ? (symbol.name as string) : String(symbol.name ?? ''),
      kind: typeof symbol.kind === 'number' ? (symbol.kind as number) : 0,
      location: {
        uri: typeof location.uri === 'string' ? (location.uri as string) : '',
        range: location.range,
      },
    };
  });
}

export function normalizeFileStatus(raw: unknown): OpenCodeFileChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((file) => ({
      path: typeof file.path === 'string' ? (file.path as string) : String(file.path ?? ''),
      added: typeof file.added === 'number' ? (file.added as number) : 0,
      removed: typeof file.removed === 'number' ? (file.removed as number) : 0,
      status: normalizeFileChangeStatus(file.status),
    }))
    .filter((file) => file.path.length > 0);
}

function normalizeFileChangeStatus(value: unknown): OpenCodeFileChangeStatus {
  return value === 'deleted' || value === 'modified' ? value : 'added';
}
