import type { EditExecutionDetail, ToolObservation } from '@vestara/shared';

/**
 * Resolve edit evidence by durable operation identity. This deliberately
 * accepts only persisted structured observations; display text and tool
 * summaries are not evidence sources.
 */
export function findEditObservation(
  messages: readonly { readonly toolObservations?: readonly ToolObservation[] }[],
  operationId: string,
): EditExecutionDetail | undefined {
  for (const message of messages) {
    for (const observation of message.toolObservations ?? []) {
      if (observation.operationId !== operationId || observation.observationKind !== 'edit') continue;
      if (observation.edit?.kind === 'edit' && observation.edit.operationId === operationId) return observation.edit;
    }
  }
  return undefined;
}

export async function fetchEditObservation(
  conversationId: string,
  operationId: string,
): Promise<EditExecutionDetail | undefined> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
  if (!response.ok) return undefined;
  const payload = (await response.json()) as {
    conversation?: { messages?: readonly { toolObservations?: readonly ToolObservation[] }[] };
  };
  return findEditObservation(payload.conversation?.messages ?? [], operationId);
}
