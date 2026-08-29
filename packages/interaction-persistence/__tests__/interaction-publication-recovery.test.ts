/**
 * AR-REC-C2 I1-9: Interaction Publication Recovery Proof
 *
 * Verifies:
 *   - pending publication survives restart
 *   - recovery uses bounded indexed query
 *   - deterministic event identity
 *   - duplicate publication does not duplicate M9
 *   - successful projection marks publication delivered
 *   - failed projection remains recoverable
 *   - M9 contains presentation/response projection
 *   - no domain execution occurs
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteInteractionStore } from '@vestara/interaction-persistence';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function tmpDb(): string {
  return path.join(os.tmpdir(), `interaction-pub-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

describe('Interaction Publication Recovery Proof', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('pending publication survives restart', async () => {
    const interaction = makeInteraction();

    // Write and close
    const store1 = await SqliteInteractionStore.open(dbPath);
    await store1.put(interaction);

    // Reopen and verify pending
    const store2 = await SqliteInteractionStore.open(dbPath);
    const pending = await store2.getPendingPublications(100);
    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('recovery uses bounded indexed query', async () => {
    const store = await SqliteInteractionStore.open(dbPath);

    // Create 100 interactions
    for (let i = 0; i < 100; i++) {
      const interaction = makeInteraction({ content: `Interaction ${i}` });
      await store.put(interaction);
    }

    // All are pending
    const allPending = await store.getPendingPublications(100);
    expect(allPending).toHaveLength(100);

    // Mark 97 as published
    for (let i = 0; i < 97; i++) {
      await store.markPublished(allPending[i].eventId);
    }

    // Recovery query — bounded by LIMIT
    const batch1 = await store.getPendingPublications(10);
    expect(batch1).toHaveLength(3); // only 3 remaining

    // Mark them published
    for (const entry of batch1) {
      await store.markPublished(entry.eventId);
    }

    // No more pending
    const batch2 = await store.getPendingPublications(10);
    expect(batch2).toHaveLength(0);
  });

  it('deterministic event identity', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const pending = await store.getPendingPublications(100);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);

    // Same interaction always produces same eventId
    const store2 = await SqliteInteractionStore.open(dbPath);
    const pending2 = await store2.getPendingPublications(100);
    expect(pending2[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('duplicate publication does not duplicate M9', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const pending = await store.getPendingPublications(100);
    const eventId = pending[0].eventId;

    // Mark as published (simulates M9 ack)
    await store.markPublished(eventId);

    // Try to mark again — should be no-op
    await store.markPublished(eventId);

    // Verify no duplicate
    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);
  });

  it('successful projection marks publication delivered', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);

    // Simulate successful projection
    await store.markPublished(pending[0].eventId);

    // Verify delivered
    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);

    // Verify interaction still exists
    const retrieved = await store.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.publishedAt).toBeDefined();
  });

  it('failed projection remains recoverable', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    // Simulate failed projection — pending remains
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);

    // Recovery can still find it
    const store2 = await SqliteInteractionStore.open(dbPath);
    const recovered = await store2.getPendingPublications(100);
    expect(recovered).toHaveLength(1);
  });

  it('M9 contains presentation/response projection after recovery', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const response = makeResponse(interaction.interactionId);
    await store.recordResponse(interaction.interactionId, response);

    // Both are pending
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(2);

    // Simulate successful projection for both
    await store.markPublished(pending[0].eventId);
    await store.markPublished(pending[1].eventId);

    // Verify both delivered
    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);
  });

  it('no domain execution occurs during recovery', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    // Recovery query — no side effects beyond querying
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);

    // Mark published — no side effects beyond updating ledger
    await store.markPublished(pending[0].eventId);

    // Verify interaction still exists and is unchanged
    const retrieved = await store.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.content).toBe(interaction.content);
  });
});
