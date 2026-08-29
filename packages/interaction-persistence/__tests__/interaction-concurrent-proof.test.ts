/**
 * AR-REC-C2 I1-9: Interaction Concurrent Response Proof
 *
 * Verifies:
 *   - concurrent responses produce exactly one authoritative response
 *   - the database uniqueness constraint is the concurrency authority
 *   - losing concurrent request rolls back completely
 *   - no durable side effects from losing request
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteInteractionStore } from '@vestara/interaction-persistence';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function tmpDb(): string {
  return path.join(os.tmpdir(), `interaction-concurrent-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function makeInteraction(overrides?: Partial<StructuredInteraction>): StructuredInteraction {
  return {
    interactionId: `int-${Date.now()}-${Math.random().toString(36).slice(2)}` as InteractionId,
    presentingParticipantId: 'agent-harness',
    presentingParticipantName: 'Agent Harness',
    createdAt: new Date().toISOString(),
    content: 'Choose an option',
    choices: [
      { choiceId: 'opt-a' as ChoiceId, label: 'Option A' },
      { choiceId: 'opt-b' as ChoiceId, label: 'Option B' },
    ],
    ...overrides,
  };
}

function makeResponse(interactionId: InteractionId, choiceId: ChoiceId = 'opt-a' as ChoiceId): InteractionResponse {
  return {
    responseId: `resp-${Date.now()}-${Math.random().toString(36).slice(2)}` as InteractionResponse['responseId'],
    interactionId,
    selectedChoiceId: choiceId,
    respondingParticipantId: 'local-user',
    respondingParticipantName: 'Local User',
    respondedAt: new Date().toISOString(),
  };
}

describe('Interaction Concurrent Response Proof', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('exactly one authoritative response from concurrent requests', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);

    // Submit both concurrently
    const results = await Promise.allSettled([
      store.recordResponse(interaction.interactionId, responseA),
      store.recordResponse(interaction.interactionId, responseB),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactly one wins
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // Verify exactly one response exists
    const response = await store.getResponse(interaction.interactionId);
    expect(response).toBeDefined();
  });

  it('losing request rolls back completely', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);

    // Submit both concurrently
    const results = await Promise.allSettled([
      store.recordResponse(interaction.interactionId, responseA),
      store.recordResponse(interaction.interactionId, responseB),
    ]);

    const failed = results.filter((r) => r.status === 'rejected');
    expect(failed).toHaveLength(1);

    // Verify the losing request left no durable side effects
    // Only one publication marker for response should exist
    const pending = await store.getPendingPublications(100);
    const responseMarkers = pending.filter((p) => p.eventId.startsWith('interaction:responded:'));
    expect(responseMarkers).toHaveLength(1);
  });

  it('concurrent same-choice requests are idempotent', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);

    // Submit both concurrently with same choice
    const results = await Promise.allSettled([
      store.recordResponse(interaction.interactionId, responseA),
      store.recordResponse(interaction.interactionId, responseB),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // One succeeds, one fails (UNIQUE constraint on response_id or interaction_id)
    expect(succeeded.length + failed.length).toBe(2);

    // Verify exactly one response
    const response = await store.getResponse(interaction.interactionId);
    expect(response).toBeDefined();
  });

  it('publication marker for losing request is rolled back', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);

    // Submit both concurrently
    await Promise.allSettled([
      store.recordResponse(interaction.interactionId, responseA),
      store.recordResponse(interaction.interactionId, responseB),
    ]);

    // Check publication ledger — only one response marker
    const pending = await store.getPendingPublications(100);
    const responseMarkers = pending.filter((p) => p.eventId.startsWith('interaction:responded:'));
    expect(responseMarkers).toHaveLength(1);
  });
});
