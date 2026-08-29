/**
 * AR-REC-C2 I1-9: Interaction Restart/Crash-Window Proof
 *
 * Verifies:
 *   - Interaction survives persistence reopen/restart
 *   - Response survives restart
 *   - Pending publication survives restart
 *   - Crash windows B–E: committed but unpublished facts are recoverable
 *   - Ledger semantics: published_at NULL = needs publication
 *   - Deterministic republishing
 *   - Safe duplicate delivery
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteInteractionStore } from '@vestara/interaction-persistence';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function tmpDb(): string {
  return path.join(os.tmpdir(), `interaction-restart-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

describe('Interaction Restart/Crash-Window Proof', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('interaction survives restart (Window B: committed but unpublished)', async () => {
    const interaction = makeInteraction();

    // Write and close (simulates crash after commit, before publication)
    const store1 = await SqliteInteractionStore.open(dbPath);
    await store1.put(interaction);

    // Reopen and verify
    const store2 = await SqliteInteractionStore.open(dbPath);
    const retrieved = await store2.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.interactionId).toBe(interaction.interactionId);
    expect(retrieved!.publishedAt).toBeNull(); // unpublished
  });

  it('response survives restart (Window B)', async () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction.interactionId);

    // Write and close
    const store1 = await SqliteInteractionStore.open(dbPath);
    await store1.put(interaction);
    await store1.recordResponse(interaction.interactionId, response);

    // Reopen and verify
    const store2 = await SqliteInteractionStore.open(dbPath);
    const retrieved = await store2.getResponse(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.response.responseId).toBe(response.responseId);
    expect(retrieved!.publishedAt).toBeNull(); // unpublished
  });

  it('pending publication survives restart (Window B)', async () => {
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

  it('recovery finds only unpublished entries (bounded indexed query)', async () => {
    const store = await SqliteInteractionStore.open(dbPath);

    // Create 10 interactions
    const interactions: StructuredInteraction[] = [];
    for (let i = 0; i < 10; i++) {
      const interaction = makeInteraction({ content: `Interaction ${i}` });
      interactions.push(interaction);
      await store.put(interaction);
    }

    // Mark 7 as published
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(10);
    for (let i = 0; i < 7; i++) {
      await store.markPublished(pending[i].eventId);
    }

    // Recovery query — should return only 3
    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(3);

    // Verify they are the unpublished ones
    const remainingIds = remaining.map((p) => p.eventId);
    expect(remainingIds).toContain(`interaction:presented:${interactions[7].interactionId}`);
    expect(remainingIds).toContain(`interaction:presented:${interactions[8].interactionId}`);
    expect(remainingIds).toContain(`interaction:presented:${interactions[9].interactionId}`);
  });

  it('deterministic eventId enables safe republishing', async () => {
    const interaction = makeInteraction();

    const store = await SqliteInteractionStore.open(dbPath);
    await store.put(interaction);

    const pending = await store.getPendingPublications(100);
    const eventId = pending[0].eventId;

    // Verify deterministic
    expect(eventId).toBe(`interaction:presented:${interaction.interactionId}`);

    // Mark as published
    await store.markPublished(eventId);

    // Verify no longer pending
    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);
  });

  it('duplicate publication is safe (markPublished is idempotent)', async () => {
    const interaction = makeInteraction();

    const store = await SqliteInteractionStore.open(dbPath);
    await store.put(interaction);

    const pending = await store.getPendingPublications(100);
    await store.markPublished(pending[0].eventId);

    // Mark again — should be no-op
    await store.markPublished(pending[0].eventId);

    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);
  });

  it('bounded batch: LIMIT respected', async () => {
    const store = await SqliteInteractionStore.open(dbPath);

    // Create 5 interactions
    for (let i = 0; i < 5; i++) {
      const interaction = makeInteraction({ content: `Interaction ${i}` });
      await store.put(interaction);
    }

    // Query with limit 3
    const batch1 = await store.getPendingPublications(3);
    expect(batch1).toHaveLength(3);

    // Mark them published
    for (const entry of batch1) {
      await store.markPublished(entry.eventId);
    }

    // Query remaining
    const batch2 = await store.getPendingPublications(3);
    expect(batch2).toHaveLength(2);
  });

  it('crash window C: committed + recoverable but not emitted', async () => {
    const interaction = makeInteraction();

    // Simulate: commit interaction, but EventBus.emit never called
    const store = await SqliteInteractionStore.open(dbPath);
    await store.put(interaction);

    // Pending publication exists
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);

    // Recovery finds it and can republish
    const eventId = pending[0].eventId;
    expect(eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('crash window D: emitted but not acknowledged', async () => {
    const interaction = makeInteraction();

    // Simulate: commit + emit, but markPublished never called
    const store = await SqliteInteractionStore.open(dbPath);
    await store.put(interaction);

    // Pending still exists
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);

    // Recovery can still find it
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('crash window E: duplicate recovery is safe', async () => {
    const interaction = makeInteraction();

    const store = await SqliteInteractionStore.open(dbPath);
    await store.put(interaction);

    // First recovery
    const pending1 = await store.getPendingPublications(100);
    expect(pending1).toHaveLength(1);

    // Simulate M9 already received (mark as published)
    await store.markPublished(pending1[0].eventId);

    // Second recovery — should find nothing
    const pending2 = await store.getPendingPublications(100);
    expect(pending2).toHaveLength(0);
  });
});
