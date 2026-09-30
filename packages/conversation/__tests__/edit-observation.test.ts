import type { ToolObservation } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { chunkToObservation, upsertObservation } from '../src/index';

const edit = {
  contract: 'assistant.execution.v1' as const,
  version: 1 as const,
  operationId: 'call-edit-1',
  kind: 'edit' as const,
  state: 'completed' as const,
  tool: 'edit',
  source: 'opencode' as const,
  timestamp: 10,
  file: 'src/example.ts',
  diffRepresentation: 'patch' as const,
  patch: '@@ -1 +1 @@\n-old\n+new',
  diffProvenance: 'runtime-provided' as const,
  beforeAfterProvenance: 'unavailable' as const,
};

const write = {
  contract: 'assistant.execution.v1' as const,
  version: 1 as const,
  operationId: 'call-write-1',
  kind: 'write' as const,
  state: 'completed' as const,
  tool: 'write' as const,
  source: 'opencode' as const,
  timestamp: 10,
  file: '.tmp/example.txt',
  fileProvenance: 'runtime-provided' as const,
  finalContent: 'new file content',
  contentProvenance: 'runtime-provided' as const,
  diffRepresentation: 'unavailable' as const,
  diffProvenance: 'unavailable' as const,
  beforeAfterProvenance: 'unavailable' as const,
};

function chunk(type: 'tool_call' | 'tool_result') {
  return {
    id: `chunk-${type}`,
    type,
    name: 'edit',
    content: type === 'tool_result' ? 'unrelated output text' : undefined,
    detail: edit,
    metadata: { sequence: 1, timestamp: '2026-09-23T00:00:00.000Z' },
  } as const;
}

function genericObservation(operationId: string, status: 'running' | 'completed'): ToolObservation {
  return {
    toolCallId: operationId,
    operationId,
    toolName: 'edit',
    status,
    timestamp: '2026-09-23T00:00:01.000Z',
    content: status === 'completed' ? 'edit completed' : '',
  };
}

describe('structured edit observation persistence', () => {
  it('preserves callID, file, and runtime diff provenance without using prose', () => {
    const observation = chunkToObservation(chunk('tool_result'));

    expect(observation).toMatchObject({
      operationId: 'call-edit-1',
      observationKind: 'edit',
      edit: {
        operationId: 'call-edit-1',
        file: 'src/example.ts',
        diffRepresentation: 'patch',
        patch: '@@ -1 +1 @@\n-old\n+new',
        diffProvenance: 'runtime-provided',
      },
    });
    expect(observation?.edit?.file).not.toContain('unrelated output text');
  });

  it('keeps edit evidence absent when the authoritative detail is unavailable', () => {
    const observation = chunkToObservation({
      ...chunk('tool_result'),
      detail: undefined,
      content: 'edit src/fabricated.ts',
    });

    expect(observation?.observationKind).toBeUndefined();
    expect(observation?.edit).toBeUndefined();
  });

  it('preserves structured running edit evidence when a generic terminal observation arrives', () => {
    const list: ToolObservation[] = [];
    const structured = chunkToObservation(chunk('tool_call'));
    expect(structured).toBeDefined();
    upsertObservation(list, { ...structured!, edit: { ...edit, state: 'running' } });

    upsertObservation(list, genericObservation('call-edit-1', 'completed'));

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      operationId: 'call-edit-1',
      status: 'completed',
      observationKind: 'edit',
      edit: { ...edit, state: 'running' },
    });
  });

  it('lets structured terminal evidence replace generic running evidence', () => {
    const list: ToolObservation[] = [];
    upsertObservation(list, genericObservation('call-edit-1', 'running'));
    upsertObservation(list, chunkToObservation(chunk('tool_result'))!);

    expect(list[0]).toMatchObject({ observationKind: 'edit', edit, status: 'completed' });
  });

  it('uses the newest structured evidence for the same operation', () => {
    const list: ToolObservation[] = [];
    const first = { ...edit, file: 'src/first.ts', patch: '@@ first' };
    const second = { ...edit, file: 'src/second.ts', patch: '@@ second' };
    upsertObservation(list, { ...genericObservation('call-edit-1', 'running'), observationKind: 'edit', edit: first });
    upsertObservation(list, {
      ...genericObservation('call-edit-1', 'completed'),
      observationKind: 'edit',
      edit: second,
    });

    expect(list[0]?.edit).toEqual(second);
  });

  it('does not carry edit evidence across operation identities', () => {
    const list: ToolObservation[] = [];
    upsertObservation(list, chunkToObservation(chunk('tool_call'))!);
    upsertObservation(list, genericObservation('call-edit-2', 'completed'));

    expect(list).toHaveLength(2);
    expect(list.find((entry) => entry.operationId === 'call-edit-2')?.edit).toBeUndefined();
    expect(list.find((entry) => entry.operationId === 'call-edit-1')?.edit).toEqual(edit);
  });
});

describe('structured write observation persistence', () => {
  it('persists write evidence and preserves it across a generic terminal lifecycle update', () => {
    const list: ToolObservation[] = [];
    upsertObservation(list, {
      toolCallId: write.operationId,
      operationId: write.operationId,
      toolName: 'write',
      status: 'running',
      timestamp: '2026-09-23T00:00:00.000Z',
      content: '',
      observationKind: 'write',
      write: { ...write, state: 'running', finalContent: undefined, contentProvenance: 'unavailable' },
    });
    upsertObservation(list, {
      toolCallId: write.operationId,
      operationId: write.operationId,
      toolName: 'write',
      status: 'completed',
      timestamp: '2026-09-23T00:00:01.000Z',
      content: 'Wrote file successfully.',
    });

    expect(list[0]).toMatchObject({
      observationKind: 'write',
      status: 'completed',
      write: { operationId: write.operationId, file: write.file },
    });
  });

  it('does not cross evidence between edit and write operation identities', () => {
    const list: ToolObservation[] = [];
    upsertObservation(list, {
      toolCallId: write.operationId,
      operationId: write.operationId,
      toolName: 'write',
      status: 'completed',
      timestamp: '2026-09-23T00:00:00.000Z',
      content: '',
      observationKind: 'write',
      write,
    });
    upsertObservation(list, {
      toolCallId: 'call-other',
      operationId: 'call-other',
      toolName: 'edit',
      status: 'completed',
      timestamp: '2026-09-23T00:00:01.000Z',
      content: 'completed',
    });

    expect(list.find((entry) => entry.operationId === 'call-other')?.write).toBeUndefined();
    expect(list.find((entry) => entry.operationId === write.operationId)?.write).toEqual(write);
  });
});
