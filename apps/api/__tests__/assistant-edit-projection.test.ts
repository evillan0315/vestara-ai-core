import { describe, expect, it } from 'vitest';
import { projectEditObservation, projectWriteObservation } from '../src/assistant-execution-projection';

function editEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'message.part.updated',
    payload: {
      part: {
        type: 'tool',
        callID: 'call-edit-001c',
        tool: 'edit',
        state: {
          status: 'completed',
          input: {
            filePath: '/workspace/repo/README.md',
            oldString: 'old',
            newString: 'new',
          },
          metadata: {
            filediff: {
              file: '/workspace/repo/README.md',
              patch: '@@ -1 +1 @@\n-old\n+new',
              additions: 1,
              deletions: 1,
            },
          },
          ...overrides,
        },
      },
    },
  };
}

describe('OpenCode edit tool projection', () => {
  it('uses the edit part callID and input.filePath, preserving same-part diff evidence', () => {
    const detail = projectEditObservation(editEvent(), '/workspace/repo');

    expect(detail).toMatchObject({
      kind: 'edit',
      operationId: 'call-edit-001c',
      file: 'README.md',
      diffRepresentation: 'patch',
      diffProvenance: 'runtime-provided',
      patch: '@@ -1 +1 @@\n-old\n+new',
      additions: 1,
      deletions: 1,
    });
  });

  it('does not infer a file target when the structured input path is absent', () => {
    const detail = projectEditObservation(
      editEvent({
        input: { oldString: 'old', newString: 'new' },
      }),
      '/workspace/repo',
    );

    expect(detail).toBeUndefined();
  });

  it('keeps View diff unavailable when the same part has no filediff patch', () => {
    const detail = projectEditObservation(
      editEvent({
        metadata: { filediff: { file: '/workspace/repo/README.md' } },
      }),
      '/workspace/repo',
    );

    expect(detail).toMatchObject({
      operationId: 'call-edit-001c',
      file: 'README.md',
      diffRepresentation: 'unavailable',
      diffProvenance: 'unavailable',
    });
  });
});

describe('OpenCode write tool projection', () => {
  it('preserves the authoritative runtime path and final content without claiming a diff', () => {
    const detail = projectWriteObservation(
      {
        type: 'message.part.updated',
        payload: {
          part: {
            type: 'tool',
            callID: 'call-write-001f',
            tool: 'write',
            state: {
              status: 'completed',
              input: {
                filePath: '/workspace/repo/.tmp/dogfood.txt',
                content: 'runtime final content',
              },
              output: 'Wrote file successfully.',
            },
          },
        },
      },
      '/workspace/repo',
    );

    expect(detail).toMatchObject({
      kind: 'write',
      operationId: 'call-write-001f',
      tool: 'write',
      file: '.tmp/dogfood.txt',
      fileProvenance: 'runtime-provided',
      finalContent: 'runtime final content',
      contentProvenance: 'runtime-provided',
      diffRepresentation: 'unavailable',
      diffProvenance: 'unavailable',
      beforeAfterProvenance: 'unavailable',
    });
  });

  it('fails closed when write input has no authoritative file path', () => {
    const detail = projectWriteObservation({
      type: 'message.part.updated',
      payload: {
        part: {
          type: 'tool',
          callID: 'call-write-no-path',
          tool: 'write',
          state: { status: 'completed', input: { content: 'content only' } },
        },
      },
    });

    expect(detail).toBeUndefined();
  });
});
