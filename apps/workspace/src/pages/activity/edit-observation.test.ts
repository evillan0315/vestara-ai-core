import { describe, expect, it } from 'vitest';
import { findEditObservation } from './edit-observation';

describe('Activity edit observation resolution', () => {
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
