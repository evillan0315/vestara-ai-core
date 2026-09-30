import type { EditExecutionDetail, FileMutationExecutionDetail, ToolObservation } from '@vestara/shared';

type ConversationMessage = { readonly toolObservations?: readonly ToolObservation[] };

/**
 * Resolve edit evidence by durable operation identity. This deliberately
 * accepts only persisted structured observations; display text and tool
 * summaries are not evidence sources.
 */
export function findEditObservation(
  messages: readonly ConversationMessage[],
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

/** Resolve either edit or write evidence using exact conversation/operation identity. */
export function findFileMutationObservation(
  messages: readonly ConversationMessage[],
  operationId: string,
): FileMutationExecutionDetail | undefined {
  for (const message of messages) {
    for (const observation of message.toolObservations ?? []) {
      if (observation.operationId !== operationId) continue;
      if (
        observation.observationKind === 'edit' &&
        observation.edit?.kind === 'edit' &&
        observation.edit.operationId === operationId
      ) {
        return observation.edit;
      }
      if (
        observation.observationKind === 'write' &&
        observation.write?.kind === 'write' &&
        observation.write.operationId === operationId
      ) {
        return observation.write;
      }
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

export async function fetchFileMutationObservation(
  conversationId: string,
  operationId: string,
): Promise<FileMutationExecutionDetail | undefined> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { conversation?: { messages?: readonly ConversationMessage[] } };
  return findFileMutationObservation(payload.conversation?.messages ?? [], operationId);
}
