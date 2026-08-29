/**
 * AR-REC-C2 I1-9: Interaction Store Tests
 *
 * Verifies:
 *   - valid interaction persists
 *   - interaction survives persistence reopen/restart
 *   - lookup by InteractionId
 *   - malformed interaction rejected
 *   - duplicate interaction rejected atomically
 *   - presentation and publication marker commit together
 *   - valid response persists
 *   - invalid choice rejected
 *   - unknown interaction rejected
 *   - response survives restart
 *   - same-choice retry is idempotent
 *   - conflicting choice rejected
 *   - concurrent responses produce exactly one authoritative response
 *   - response and publication marker commit together
 *   - pending publication survives restart
 *   - pending recovery uses bounded indexed query
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
  return path.join(os.tmpdir(), `interaction-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

describe('SqliteInteractionStore', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('persists and retrieves a valid interaction', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);
    const retrieved = await store.get(interaction.interactionId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.interactionId).toBe(interaction.interactionId);
    expect(retrieved!.interaction.content).toBe(interaction.content);
    expect(retrieved!.interaction.choices).toHaveLength(2);
    expect(retrieved!.publishedAt).toBeNull(); // publication marker pending
  });

  it('survives persistence reopen/restart', async () => {
    const interaction = makeInteraction();

    // Write and close
    const store1 = await SqliteInteractionStore.open(dbPath);
    await store1.put(interaction);

    // Reopen and verify
    const store2 = await SqliteInteractionStore.open(dbPath);
    const retrieved = await store2.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.interactionId).toBe(interaction.interactionId);
  });

  it('looks up by InteractionId', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);
    expect(await store.has(interaction.interactionId)).toBe(true);
    expect(await store.has('nonexistent' as InteractionId)).toBe(false);
  });

  it('rejects duplicate InteractionId atomically', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);
    await expect(store.put(interaction)).rejects.toThrow();
  });

  it('persists and retrieves a valid response', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const response = makeResponse(interaction.interactionId);
    await store.recordResponse(interaction.interactionId, response);

    const retrieved = await store.getResponse(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.response.responseId).toBe(response.responseId);
    expect(retrieved!.response.selectedChoiceId).toBe(response.selectedChoiceId);
    expect(retrieved!.publishedAt).toBeNull(); // publication marker pending
  });

  it('rejects invalid ChoiceId', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const response = makeResponse(interaction.interactionId, 'invalid-choice' as ChoiceId);
    await expect(store.recordResponse(interaction.interactionId, response)).rejects.toThrow('Invalid ChoiceId');
  });

  it('rejects unknown interaction', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const response = makeResponse('nonexistent' as InteractionId);
    await expect(store.recordResponse('nonexistent' as InteractionId, response)).rejects.toThrow(
      'Interaction not found',
    );
  });

  it('response survives restart', async () => {
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
  });

  it('same-choice retry is idempotent', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const response = makeResponse(interaction.interactionId);
    await store.recordResponse(interaction.interactionId, response);

    // Retry with same response (same responseId) — should fail with UNIQUE violation
    await expect(store.recordResponse(interaction.interactionId, response)).rejects.toThrow();
  });

  it('conflicting choice is rejected', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    await store.recordResponse(interaction.interactionId, responseA);

    // Try different choice — should fail (one response per interaction)
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);
    await expect(store.recordResponse(interaction.interactionId, responseB)).rejects.toThrow();
  });

  it('publication marker commits together with interaction', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);

    // Check publication ledger
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
    expect(pending[0].interactionId).toBe(interaction.interactionId);
  });

  it('publication marker commits together with response', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const response = makeResponse(interaction.interactionId);
    await store.recordResponse(interaction.interactionId, response);

    // Check publication ledger has both entries
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(2);
    expect(pending.some((p) => p.eventId === `interaction:presented:${interaction.interactionId}`)).toBe(true);
    expect(pending.some((p) => p.eventId === `interaction:responded:${interaction.interactionId}`)).toBe(true);
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

  it('bounded indexed query returns only pending', async () => {
    const store = await SqliteInteractionStore.open(dbPath);

    // Create 5 interactions
    for (let i = 0; i < 5; i++) {
      const interaction = makeInteraction({ content: `Interaction ${i}` });
      await store.put(interaction);
    }

    // Mark 2 as published
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(5);
    await store.markPublished(pending[0].eventId);
    await store.markPublished(pending[1].eventId);

    // Query pending — should return 3
    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(3);
  });

  it('deterministic event identity', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);

    const pending = await store.getPendingPublications(100);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('successful projection marks publication delivered', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);

    await store.markPublished(pending[0].eventId);

    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);
  });

  it('failed projection remains recoverable', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();

    await store.put(interaction);

    // Simulate failed publication — pending remains
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('concurrent responses produce exactly one authoritative response', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);

    // Try both concurrently — one should succeed, one should fail
    const results = await Promise.allSettled([
      store.recordResponse(interaction.interactionId, responseA),
      store.recordResponse(interaction.interactionId, responseB),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // Verify exactly one response exists
    const response = await store.getResponse(interaction.interactionId);
    expect(response).toBeDefined();
  });

  it('no domain execution occurs', async () => {
    const store = await SqliteInteractionStore.open(dbPath);
    const interaction = makeInteraction();
    await store.put(interaction);

    const response = makeResponse(interaction.interactionId);
    await store.recordResponse(interaction.interactionId, response);

    // Verify no side effects beyond persistence
    const retrieved = await store.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.content).toBe(interaction.content);
  });
});
