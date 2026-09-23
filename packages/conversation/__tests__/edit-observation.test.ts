import { describe, expect, it } from 'vitest';
import { chunkToObservation } from '../src/index';

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
});
