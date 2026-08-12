import type { OpenCodeDiffFile, OpenCodeMessage, OpenCodeTodo } from './client/opencode-types';

// Pure normalization helpers for OpenCode session data (todos, diffs, messages).
// Renderer-free and unit-testable without an upstream server.

export function normalizeMessages(raw: unknown): OpenCodeMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((message) => {
      const info = (message.info ?? message) as Record<string, unknown>;
      const parts = Array.isArray(message.parts)
        ? message.parts.filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === 'object')
        : [];
      return {
        id: typeof info.id === 'string' ? info.id : undefined,
        role: typeof info.role === 'string' ? info.role : undefined,
        sessionId: typeof info.sessionID === 'string' ? info.sessionID : undefined,
        agent: typeof info.agent === 'string' ? info.agent : undefined,
        model: typeof info.model === 'string' ? info.model : undefined,
        text: extractMessageText(info, parts),
        structuredOutput: info.structured_output,
        parts: parts.map((part) => ({
          id: typeof part.id === 'string' ? part.id : undefined,
          type: typeof part.type === 'string' ? part.type : 'text',
          text: typeof part.text === 'string' ? part.text : undefined,
          content: typeof part.content === 'string' ? part.content : undefined,
        })),
        createdAt:
          typeof info.time === 'number'
            ? new Date(info.time).toISOString()
            : typeof info.time === 'object' && info.time !== null
              ? (info.time as { created?: unknown }).created
                ? new Date((info.time as { created: number }).created).toISOString()
                : undefined
              : undefined,
      };
    });
}

function extractMessageText(info: Record<string, unknown>, parts: readonly Record<string, unknown>[]): string {
  if (typeof info.text === 'string' && info.text) return info.text as string;
  const textParts = parts.filter((part) => typeof part.text === 'string');
  if (textParts.length > 0) {
    return textParts.map((part) => part.text as string).join('\n');
  }
  return '';
}

export function normalizeTodos(raw: unknown): OpenCodeTodo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((todo) => ({
      id: typeof todo.id === 'string' ? todo.id : undefined,
      content:
        typeof todo.content === 'string'
          ? todo.content
          : typeof todo.text === 'string'
            ? (todo.text as string)
            : String(todo.title ?? ''),
      status: typeof todo.status === 'string' ? todo.status : undefined,
    }))
    .filter((todo) => todo.content.length > 0);
}

export function normalizeDiff(raw: unknown): OpenCodeDiffFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((file) => ({
      path: typeof file.path === 'string' ? file.path : String(file.filename ?? file.name ?? ''),
      operation:
        typeof file.operation === 'string'
          ? (file.operation as OpenCodeDiffFile['operation'])
          : typeof file.status === 'string'
            ? (file.status as OpenCodeDiffFile['operation'])
            : undefined,
      additions: typeof file.additions === 'number' ? file.additions : undefined,
      deletions: typeof file.deletions === 'number' ? file.deletions : undefined,
      hunks: Array.isArray(file.hunks)
        ? file.hunks
            .filter((hunk): hunk is Record<string, unknown> => Boolean(hunk) && typeof hunk === 'object')
            .map((hunk) => ({
              oldStart: typeof hunk.oldStart === 'number' ? hunk.oldStart : undefined,
              oldLines: typeof hunk.oldLines === 'number' ? hunk.oldLines : undefined,
              newStart: typeof hunk.newStart === 'number' ? hunk.newStart : undefined,
              newLines: typeof hunk.newLines === 'number' ? hunk.newLines : undefined,
              content: typeof hunk.content === 'string' ? hunk.content : '',
            }))
        : [],
    }))
    .filter((file) => file.path.length > 0);
}
