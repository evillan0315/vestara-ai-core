import { describe, expect, it } from 'vitest';
import { invertHunk, parseUnifiedDiff } from '../src/index.js';

describe('diff engine', () => {
  it('parses and inverts unified hunks', () => {
    const result = parseUnifiedDiff({
      taskId: 'T',
      patch: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n same\n',
    });
    expect(result[0]).toMatchObject({ path: 'a.ts', additions: 1, deletions: 1, operation: 'update' });
    expect(invertHunk(result[0]!.hunks[0]!).lines.map((x) => x.kind)).toEqual(['addition', 'deletion', 'context']);
  });
});
