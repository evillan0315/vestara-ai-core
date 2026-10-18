import type { DiffHunk } from '@vestara/tui-protocol';
import { describe, expect, it } from 'vitest';
import { contentHash, invertHunk, parseUnifiedDiff } from '../src/index';

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line one
-old line
+new line
+added line
 line three
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,1 @@
+hello
diff --git a/src/old.ts b/src/renamed.ts
similarity index 90%
rename from src/old.ts
rename to src/renamed.ts
--- a/src/old.ts
+++ b/src/renamed.ts
@@ -1,1 +1,1 @@
-removed
+kept
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
`;

describe('contentHash', () => {
  it('matches the known sha256 of empty input', () => {
    expect(contentHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes strings and byte arrays identically', () => {
    const text = 'hello world';
    expect(contentHash(text)).toBe(contentHash(new TextEncoder().encode(text)));
    expect(contentHash(text)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('parseUnifiedDiff', () => {
  it('parses changed, created, renamed, and deleted files', () => {
    const changes = parseUnifiedDiff({
      patch: PATCH,
      taskId: 'task-1',
      agentId: 'agent-1',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(changes.map((change) => change.path)).toEqual(['src/a.ts', 'src/new.ts', 'src/renamed.ts', 'src/gone.ts']);
    expect(changes.map((change) => change.operation)).toEqual(['update', 'create', 'rename', 'delete']);
  });

  it('captures metadata, counts, and hunk line anchors for a modified file', () => {
    const [modified] = parseUnifiedDiff({
      patch: PATCH,
      taskId: 'task-1',
      agentId: 'agent-1',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(modified.taskId).toBe('task-1');
    expect(modified.agentId).toBe('agent-1');
    expect(modified.observedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(modified.previousPath).toBeUndefined();
    expect(modified.additions).toBe(2);
    expect(modified.deletions).toBe(1);
    expect(modified.verificationIds).toEqual([]);
    expect(modified.preExisting).toBe(false);

    expect(modified.hunks).toHaveLength(1);
    expect(modified.hunks[0].oldStart).toBe(1);
    expect(modified.hunks[0].newStart).toBe(1);
    expect(modified.hunks[0].lines).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, content: 'line one' },
      { kind: 'deletion', oldLine: 2, content: 'old line' },
      { kind: 'addition', newLine: 2, content: 'new line' },
      { kind: 'addition', newLine: 3, content: 'added line' },
      { kind: 'context', oldLine: 3, newLine: 4, content: 'line three' },
    ]);
  });

  it('records the previous path for a renamed file', () => {
    const renamed = parseUnifiedDiff({ patch: PATCH, taskId: 'task-1' })[2];
    expect(renamed.previousPath).toBe('src/old.ts');
    expect(renamed.hunks[0].lines).toEqual([
      { kind: 'deletion', oldLine: 1, content: 'removed' },
      { kind: 'addition', newLine: 1, content: 'kept' },
    ]);
  });

  it('marks files present in the baseline as pre-existing', () => {
    const changes = parseUnifiedDiff({
      patch: PATCH,
      taskId: 'task-1',
      baseline: {
        head: 'h',
        branch: 'b',
        worktreeId: 'w',
        files: { 'src/a.ts': 'old contents' },
        untracked: [],
        capturedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(changes[0].preExisting).toBe(true);
    expect(changes[1].preExisting).toBe(false);
  });

  it('defaults observedAt to an ISO timestamp', () => {
    const [change] = parseUnifiedDiff({ patch: 'diff --git a/f.ts b/f.ts\n@@ -0,0 +1,1 @@\n+x\n', taskId: 't' });
    expect(change.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns no changes for an empty patch', () => {
    expect(parseUnifiedDiff({ patch: '', taskId: 't' })).toEqual([]);
  });

  it('skips malformed chunks without an a/b header', () => {
    expect(parseUnifiedDiff({ patch: 'diff --git not-a-path\n@@ -1 +1 @@\n+x\n', taskId: 't' })).toEqual([]);
  });
});

describe('invertHunk', () => {
  const hunk: DiffHunk = {
    id: 'src/a.ts:0',
    header: '@@ -1,3 +1,4 @@',
    oldStart: 1,
    newStart: 1,
    lines: [
      { kind: 'context', oldLine: 1, newLine: 1, content: 'line one' },
      { kind: 'deletion', oldLine: 2, content: 'old line' },
      { kind: 'addition', newLine: 2, content: 'new line' },
    ],
  };

  it('swaps additions/deletions and line anchors', () => {
    const inverted = invertHunk(hunk);

    expect(inverted.id).toBe('inverse:src/a.ts:0');
    expect(inverted.oldStart).toBe(1);
    expect(inverted.newStart).toBe(1);
    expect(inverted.lines).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, content: 'line one' },
      { kind: 'addition', newLine: 2, content: 'old line' },
      { kind: 'deletion', oldLine: 2, content: 'new line' },
    ]);
  });

  it('restores line kinds and anchors when applied twice', () => {
    const roundTripped = invertHunk(invertHunk(hunk));

    expect(roundTripped.id).toBe('inverse:inverse:src/a.ts:0');
    expect(roundTripped.lines.map((line) => line.kind)).toEqual(['context', 'deletion', 'addition']);
    expect(roundTripped.oldStart).toBe(1);
    expect(roundTripped.newStart).toBe(1);
  });
});
