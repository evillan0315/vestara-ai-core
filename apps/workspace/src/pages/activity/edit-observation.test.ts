import { describe, expect, it } from 'vitest';
import type { EditExecutionDetail, ToolObservation, WriteExecutionDetail } from '@vestara/shared';
import { hasAuthoritativeEditDiff } from './activity-edit-inspection';
import { findEditObservation, findFileMutationObservation } from './edit-observation';

const preservedEdit: EditExecutionDetail = {
  contract: 'assistant.execution.v1',
  version: 1,
  operationId: 'call-edit-preserved',
  kind: 'edit',
  state: 'completed',
  tool: 'edit',
  source: 'opencode',
  timestamp: 2,
  file: 'src/authoritative.ts',
  diffRepresentation: 'patch',
  diffProvenance: 'runtime-provided',
  beforeAfterProvenance: 'unavailable',
  patch: '@@ -1 +1 @@\n-old\n+new',
};

const preservedWrite: WriteExecutionDetail = {
  contract: 'assistant.execution.v1',
  version: 1,
  operationId: 'call-write-preserved',
  kind: 'write',
  state: 'completed',
  tool: 'write',
  source: 'opencode',
  timestamp: 2,
  file: '.tmp/authoritative.txt',
  fileProvenance: 'runtime-provided',
  finalContent: 'runtime content',
  contentProvenance: 'runtime-provided',
  diffRepresentation: 'unavailable',
  diffProvenance: 'unavailable',
  beforeAfterProvenance: 'unavailable',
};

function persistedEditObservation(overrides: Partial<ToolObservation> = {}): ToolObservation {
  return {
    toolCallId: 'call-edit-preserved',
    operationId: 'call-edit-preserved',
    toolName: 'edit',
    status: 'completed',
    timestamp: '2026-09-24T00:00:02.000Z',
    content: 'edit completed',
    observationKind: 'edit',
    edit: preservedEdit,
    ...overrides,
  };
}

describe('Activity edit observation resolution', () => {
  it('resolves the complete authoritative Activity-to-action fixture', () => {
    const activity = {
      conversationId: 'conv-authoritative',
      callID: 'call-edit-preserved',
    } as const;
    const conversations = new Map([
      [
        'conv-authoritative',
        { messages: [{ toolObservations: [persistedEditObservation()] }] },
      ],
      ['conv-other', { messages: [{ toolObservations: [persistedEditObservation()] }] }],
    ]);
    const selected = conversations.get(activity.conversationId);
    const detail = findEditObservation(selected?.messages ?? [], activity.callID);

    expect(selected).toBeDefined();
    expect(detail?.operationId).toBe(activity.callID);
    expect(detail?.file).toBe('src/authoritative.ts');
    expect(detail?.diffRepresentation).toBe('patch');
    expect(detail && hasAuthoritativeEditDiff(detail)).toBe(true);
  });

  it('fails closed for wrong conversation or operation identity', () => {
    const observation = persistedEditObservation();
    const conversations = new Map([
      ['conv-authoritative', { messages: [{ toolObservations: [observation] }] }],
    ]);

    expect(findEditObservation(conversations.get('conv-missing')?.messages ?? [], 'call-edit-preserved')).toBeUndefined();
    expect(findEditObservation(conversations.get('conv-authoritative')?.messages ?? [], 'call-edit-other')).toBeUndefined();
    expect(
      findEditObservation(
        [{ toolObservations: [persistedEditObservation({ operationId: 'call-edit-other' })] }],
        'call-edit-preserved',
      ),
    ).toBeUndefined();
  });

  it('keeps generic observations without captured structured evidence non-actionable', () => {
    const generic: ToolObservation = {
      toolCallId: 'call-edit-generic',
      operationId: 'call-edit-generic',
      toolName: 'edit',
      status: 'completed',
      timestamp: '2026-09-24T00:00:02.000Z',
      content: 'edit completed',
    };

    const detail = findEditObservation([{ toolObservations: [generic] }], 'call-edit-generic');
    expect(detail).toBeUndefined();
  });

  it('resolves only the matching durable operation identity', () => {
    const detail = {
      contract: 'assistant.execution.v1' as const,
      version: 1 as const,
      operationId: 'call-edit-1',
      kind: 'edit' as const,
      state: 'completed' as const,
      tool: 'edit',
      source: 'opencode' as const,
      timestamp: 1,
      file: 'src/authoritative.ts',
      diffRepresentation: 'unavailable' as const,
      diffProvenance: 'unavailable' as const,
      beforeAfterProvenance: 'unavailable' as const,
    };

    expect(
      findEditObservation(
        [{ toolObservations: [{ toolCallId: 'call-edit-1', operationId: 'call-edit-1', toolName: 'edit', status: 'completed', timestamp: '', content: '', observationKind: 'edit', edit: detail }] }],
        'call-edit-1',
      ),
    ).toEqual(detail);
    expect(
      findEditObservation(
        [{ toolObservations: [{ toolCallId: 'call-other', operationId: 'call-other', toolName: 'edit', status: 'completed', timestamp: '', content: '', observationKind: 'edit', edit: detail }] }],
        'call-edit-1',
      ),
    ).toBeUndefined();
  });

  it('does not create a file target from text when structured edit evidence is missing', () => {
    expect(
      findEditObservation(
        [{ toolObservations: [{ toolCallId: 'call-edit-1', operationId: 'call-edit-1', toolName: 'edit', status: 'completed', timestamp: '', content: 'edited src/fabricated.ts' }] }],
        'call-edit-1',
      ),
    ).toBeUndefined();
  });
});

describe('Activity file mutation resolution', () => {
  it('resolves write evidence by exact operation identity and leaves diff unavailable', () => {
    const observation: ToolObservation = {
      toolCallId: preservedWrite.operationId,
      operationId: preservedWrite.operationId,
      toolName: 'write',
      status: 'completed',
      timestamp: '2026-09-24T00:00:02.000Z',
      content: 'Wrote file successfully.',
      observationKind: 'write',
      write: preservedWrite,
    };

    expect(findFileMutationObservation([{ toolObservations: [observation] }], preservedWrite.operationId)).toEqual(
      preservedWrite,
    );
    expect(findFileMutationObservation([{ toolObservations: [observation] }], 'call-other')).toBeUndefined();
  });
});
