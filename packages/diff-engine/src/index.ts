import { createHash } from 'node:crypto';
import type { DiffHunk, DiffLine, TaskFileChange } from '@vestara/tui-protocol';

export type DiffScope = 'task' | 'working-tree' | 'staged' | 'unstaged' | 'checkpoint' | 'branch' | 'commit';
export interface TaskBaseline {
  readonly head: string;
  readonly branch: string;
  readonly worktreeId: string;
  readonly files: Readonly<Record<string, string>>;
  readonly untracked: readonly string[];
  readonly capturedAt: string;
}

export function contentHash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function parseUnifiedDiff(input: {
  readonly patch: string;
  readonly taskId: string;
  readonly agentId?: string;
  readonly baseline?: TaskBaseline;
  readonly observedAt?: string;
}): readonly TaskFileChange[] {
  const files: TaskFileChange[] = [];
  const chunks = input.patch.split(/^diff --git /m).slice(1);
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    const match = lines[0]?.match(/^a\/(.+) b\/(.+)$/);
    if (!match) continue;
    const previousPath = match[1];
    const currentPath = match[2];
    const created = lines.some((line) => line.startsWith('new file mode'));
    const deleted = lines.some((line) => line.startsWith('deleted file mode'));
    const renamed = previousPath !== currentPath || lines.some((line) => line.startsWith('rename from '));
    const hunks: DiffHunk[] = [];
    let additions = 0;
    let deletions = 0;
    for (let index = 0; index < lines.length; index++) {
      const header = lines[index];
      const headerMatch = header?.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (!headerMatch) continue;
      let oldLine = Number(headerMatch[1]);
      let newLine = Number(headerMatch[2]);
      const diffLines: DiffLine[] = [];
      for (index++; index < lines.length && !lines[index]?.startsWith('@@ '); index++) {
        const line = lines[index] ?? '';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          diffLines.push({ kind: 'addition', newLine: newLine++, content: line.slice(1) });
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          diffLines.push({ kind: 'deletion', oldLine: oldLine++, content: line.slice(1) });
          deletions++;
        } else if (line.startsWith(' '))
          diffLines.push({ kind: 'context', oldLine: oldLine++, newLine: newLine++, content: line.slice(1) });
      }
      index--;
      hunks.push({
        id: `${currentPath}:${hunks.length}`,
        header: header ?? '',
        oldStart: Number(headerMatch[1]),
        newStart: Number(headerMatch[2]),
        lines: diffLines,
      });
    }
    files.push({
      taskId: input.taskId,
      agentId: input.agentId,
      path: currentPath,
      previousPath: renamed ? previousPath : undefined,
      operation: created ? 'create' : deleted ? 'delete' : renamed ? 'rename' : 'update',
      additions,
      deletions,
      hunks,
      verificationIds: [],
      observedAt: input.observedAt ?? new Date().toISOString(),
      preExisting: input.baseline ? Object.hasOwn(input.baseline.files, currentPath) : false,
    });
  }
  return files;
}

export function invertHunk(hunk: DiffHunk): DiffHunk {
  return {
    ...hunk,
    id: `inverse:${hunk.id}`,
    oldStart: hunk.newStart,
    newStart: hunk.oldStart,
    lines: hunk.lines.map((line) =>
      line.kind === 'addition'
        ? { kind: 'deletion', oldLine: line.newLine, content: line.content }
        : line.kind === 'deletion'
          ? { kind: 'addition', newLine: line.oldLine, content: line.content }
          : { ...line, oldLine: line.newLine, newLine: line.oldLine },
    ),
  };
}
