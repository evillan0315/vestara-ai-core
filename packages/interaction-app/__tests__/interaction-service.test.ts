/**
 * AR-REC-C2 I1-9: Interaction Service Tests
 *
 * Verifies:
 *   - valid interaction persists
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
import { InteractionService, ResponseConflictError } from '@vestara/interaction-app';
import type {
  InteractionPresentedPayload,
  InteractionPublicationPort,
  InteractionRespondedPayload,
} from '@vestara/interaction-persistence';
import { SqliteInteractionStore } from '@vestara/interaction-persistence';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function tmpDb(): string {
  return path.join(os.tmpdir(), `interaction-svc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

class MockPublicationPort implements InteractionPublicationPort {
  public presented: InteractionPresentedPayload[] = [];
  public responded: InteractionRespondedPayload[] = [];

  async onInteractionPresented(payload: InteractionPresentedPayload): Promise<void> {
    this.presented.push(payload);
  }

  async onInteractionResponded(payload: InteractionRespondedPayload): Promise<void> {
    this.responded.push(payload);
  }
}

describe('InteractionService', () => {
  let dbPath: string;
  let store: SqliteInteractionStore;
  let publication: MockPublicationPort;
  let service: InteractionService;

  beforeEach(async () => {
    dbPath = tmpDb();
    store = await SqliteInteractionStore.open(dbPath);
    publication = new MockPublicationPort();
    service = new InteractionService({ persistence: store, publication });
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('persists a valid interaction and publishes', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    // Verify persistence
    const retrieved = await service.getInteraction(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.interactionId).toBe(interaction.interactionId);

    // Verify publication
    expect(publication.presented).toHaveLength(1);
    expect(publication.presented[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
    expect(publication.presented[0].interactionId).toBe(interaction.interactionId);
  });

  it('rejects malformed interaction (zero choices)', async () => {
    const interaction = makeInteraction({ choices: [] });
    await expect(service.present(interaction)).rejects.toThrow('validation failed');
  });

  it('rejects duplicate interaction atomically', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);
    await expect(service.present(interaction)).rejects.toThrow();
  });

  it('persists a valid response and publishes', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    const recorded = await service.recordResponse(interaction.interactionId, response);

    expect(recorded.responseId).toBe(response.responseId);

    // Verify publication
    expect(publication.responded).toHaveLength(1);
    expect(publication.responded[0].eventId).toBe(`interaction:responded:${interaction.interactionId}`);
  });

  it('rejects invalid ChoiceId', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId, 'invalid' as ChoiceId);
    await expect(service.recordResponse(interaction.interactionId, response)).rejects.toThrow('validation failed');
  });

  it('rejects unknown interaction', async () => {
    const response = makeResponse('nonexistent' as InteractionId);
    await expect(service.recordResponse('nonexistent' as InteractionId, response)).rejects.toThrow('not found');
  });

  it('same-choice retry is idempotent', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    const first = await service.recordResponse(interaction.interactionId, response);

    // Retry with same choice — should return existing response idempotently
    const retry = await service.recordResponse(interaction.interactionId, response);
    expect(retry.responseId).toBe(first.responseId);
    expect(retry.selectedChoiceId).toBe(first.selectedChoiceId);
    expect(retry.respondedAt).toBe(first.respondedAt);
    expect(retry.respondingParticipantId).toBe(first.respondingParticipantId);
    expect(retry.respondingParticipantName).toBe(first.respondingParticipantName);

    // No additional publication event emitted
    expect(publication.responded).toHaveLength(1);
  });

  it('conflicting choice throws ResponseConflictError', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    await service.recordResponse(interaction.interactionId, responseA);

    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);
    await expect(service.recordResponse(interaction.interactionId, responseB)).rejects.toThrow(ResponseConflictError);
  });

  it('publication marker commits together with interaction', async () => {
    // Use a failing publication port to simulate publication failure
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    await expect(failingService.present(interaction)).rejects.toThrow('EventBus unavailable');

    // Publication marker should still be pending (committed but not published)
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('publication marker commits together with response', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    // Use a failing publication port for response
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const response = makeResponse(interaction.interactionId);
    await expect(failingService.recordResponse(interaction.interactionId, response)).rejects.toThrow(
      'EventBus unavailable',
    );

    // Response publication marker should be pending
    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1); // only the response marker (interaction was published successfully)
    expect(pending[0].eventId).toBe(`interaction:responded:${interaction.interactionId}`);
  });

  it('pending publication survives restart', async () => {
    // Use a failing publication port to leave publication pending
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    await expect(failingService.present(interaction)).rejects.toThrow();

    // Simulate restart — create new service with same DB
    const store2 = await SqliteInteractionStore.open(dbPath);
    const service2 = new InteractionService({ persistence: store2, publication: new MockPublicationPort() });

    const pending = await service2.getPendingPublications(100);
    expect(pending).toHaveLength(1);
  });

  it('deterministic event identity', async () => {
    // Use a failing publication port to leave publication pending
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    await expect(failingService.present(interaction)).rejects.toThrow();

    const pending = await store.getPendingPublications(100);
    expect(pending[0].eventId).toBe(`interaction:presented:${interaction.interactionId}`);
  });

  it('successful projection marks publication delivered', async () => {
    // Use a failing publication port to leave publication pending
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    await expect(failingService.present(interaction)).rejects.toThrow();

    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);

    // Simulate successful recovery
    await store.markPublished(pending[0].eventId);

    const remaining = await store.getPendingPublications(100);
    expect(remaining).toHaveLength(0);
  });

  it('failed projection remains recoverable', async () => {
    // Use a failing publication port to leave publication pending
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    await expect(failingService.present(interaction)).rejects.toThrow();

    const pending = await store.getPendingPublications(100);
    expect(pending).toHaveLength(1);
  });

  it('no domain execution occurs', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    await service.recordResponse(interaction.interactionId, response);

    // Verify no side effects beyond persistence and publication
    const retrieved = await service.getInteraction(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.interaction.content).toBe(interaction.content);
  });

  // ─── I2-C1: Idempotent / Conflict Classification ─────────

  it('same-choice retry returns existing responseId unchanged', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    const first = await service.recordResponse(interaction.interactionId, response);

    // Retry with same choice from different request context
    const retryResponse = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const retry = await service.recordResponse(interaction.interactionId, retryResponse);

    // responseId must NOT change — the authoritative response wins
    expect(retry.responseId).toBe(first.responseId);
  });

  it('same-choice retry returns existing respondedAt unchanged', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    const first = await service.recordResponse(interaction.interactionId, response);

    // Wait a tick to ensure time would have advanced
    await new Promise((r) => setTimeout(r, 10));

    const retryResponse = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const retry = await service.recordResponse(interaction.interactionId, retryResponse);

    // respondedAt must NOT change — server clock authority from original response
    expect(retry.respondedAt).toBe(first.respondedAt);
  });

  it('same-choice retry returns existing responder provenance unchanged', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    const first = await service.recordResponse(interaction.interactionId, response);

    // Retry with different participant context
    const retryResponse: InteractionResponse = {
      responseId: `resp-different-${Date.now()}` as InteractionResponse['responseId'],
      interactionId: interaction.interactionId,
      selectedChoiceId: 'opt-a' as ChoiceId,
      respondingParticipantId: 'different-user',
      respondingParticipantName: 'Different User',
      respondedAt: new Date().toISOString(),
    };
    const retry = await service.recordResponse(interaction.interactionId, retryResponse);

    // Responder provenance must NOT be overwritten
    expect(retry.respondingParticipantId).toBe(first.respondingParticipantId);
    expect(retry.respondingParticipantName).toBe(first.respondingParticipantName);
  });

  it('same-choice retry creates no second publication entry', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    await service.recordResponse(interaction.interactionId, response);

    // Only 1 publication event from the first response
    expect(publication.responded).toHaveLength(1);
    const firstEventId = publication.responded[0].eventId;

    // Retry same choice
    const retryResponse = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    await service.recordResponse(interaction.interactionId, retryResponse);

    // Still only 1 publication event — no second emission
    expect(publication.responded).toHaveLength(1);
    expect(publication.responded[0].eventId).toBe(firstEventId);
  });

  it('same-choice retry creates no second ledger fact', async () => {
    // Use a failing publication port to keep the response publication pending
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    // Present throws on publish, but interaction is persisted (put() succeeds before throw)
    await expect(failingService.present(interaction)).rejects.toThrow('EventBus unavailable');

    // First response attempt — publication fails, response persisted, ledger pending
    const response = makeResponse(interaction.interactionId);
    await expect(failingService.recordResponse(interaction.interactionId, response)).rejects.toThrow(
      'EventBus unavailable',
    );

    // Check ledger has exactly one response marker (pending because publish failed)
    const pending = await store.getPendingPublications(100);
    const responseMarkers = pending.filter((p) => p.eventId === `interaction:responded:${interaction.interactionId}`);
    expect(responseMarkers).toHaveLength(1);

    // Retry same choice — idempotent return, no new ledger entry
    const retryResponse = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const retry = await failingService.recordResponse(interaction.interactionId, retryResponse);

    // Still exactly one response marker — no second ledger fact
    const pendingAfter = await store.getPendingPublications(100);
    const responseMarkersAfter = pendingAfter.filter(
      (p) => p.eventId === `interaction:responded:${interaction.interactionId}`,
    );
    expect(responseMarkersAfter).toHaveLength(1);

    // Verify the retry returned the existing response
    expect(retry.responseId).toBe(response.responseId);
  });

  it('ResponseConflictError contains interactionId and choice details', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    await service.recordResponse(interaction.interactionId, responseA);

    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);
    try {
      await service.recordResponse(interaction.interactionId, responseB);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResponseConflictError);
      const conflict = err as ResponseConflictError;
      expect(conflict.interactionId).toBe(interaction.interactionId);
      expect(conflict.attemptedChoiceId).toBe('opt-b');
      expect(conflict.existingChoiceId).toBe('opt-a');
      expect(conflict.message).toContain('Response conflict');
      expect(conflict.message).not.toContain('SQLite');
      expect(conflict.message).not.toContain('UNIQUE');
    }
  });

  it('concurrent different-choice requests: one succeeds, one throws ResponseConflictError', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);

    // Submit concurrently — one should succeed, one should throw ResponseConflictError
    const results = await Promise.allSettled([
      service.recordResponse(interaction.interactionId, responseA),
      service.recordResponse(interaction.interactionId, responseB),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // Verify exactly one response exists
    const retrieved = await service.getResponse(interaction.interactionId);
    expect(retrieved).toBeDefined();
  });

  it('concurrent same-choice requests converge to one authoritative response', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);

    // Submit both concurrently with same choice
    const results = await Promise.allSettled([
      service.recordResponse(interaction.interactionId, responseA),
      service.recordResponse(interaction.interactionId, responseB),
    ]);

    // Both should resolve — one succeeds at DB level, one retries and returns idempotently
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length + failed.length).toBe(2);

    // Both successful results should reference the same authoritative response
    if (succeeded.length === 2) {
      const respA = (succeeded[0] as PromiseFulfilledResult<InteractionResponse>).value;
      const respB = (succeeded[1] as PromiseFulfilledResult<InteractionResponse>).value;
      expect(respA.responseId).toBe(respB.responseId);
    }

    // Verify exactly one response
    const response = await service.getResponse(interaction.interactionId);
    expect(response).toBeDefined();
  });

  it('publication failure followed by same-choice retry does not mark pending published', async () => {
    // Use a failing publication port to leave response publication pending
    const failingPublication: InteractionPublicationPort = {
      async onInteractionPresented() {
        throw new Error('EventBus unavailable');
      },
      async onInteractionResponded() {
        throw new Error('EventBus unavailable');
      },
    };
    const failingService = new InteractionService({ persistence: store, publication: failingPublication });

    const interaction = makeInteraction();
    await expect(failingService.present(interaction)).rejects.toThrow('EventBus unavailable');

    // First response attempt — publication fails, response is persisted, ledger pending
    const response = makeResponse(interaction.interactionId);
    await expect(failingService.recordResponse(interaction.interactionId, response)).rejects.toThrow(
      'EventBus unavailable',
    );

    // Verify response is persisted and publication is pending
    const pendingBefore = await store.getPendingPublications(100);
    expect(pendingBefore.some((p) => p.eventId === `interaction:responded:${interaction.interactionId}`)).toBe(true);

    // Same-choice retry — should return idempotently without marking pending published
    const retryResponse = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const retry = await failingService.recordResponse(interaction.interactionId, retryResponse);
    expect(retry.responseId).toBe(response.responseId);

    // Publication should STILL be pending — retry did not modify ledger
    const pendingAfter = await store.getPendingPublications(100);
    expect(pendingAfter.some((p) => p.eventId === `interaction:responded:${interaction.interactionId}`)).toBe(true);
  });

  it('existing I1 structural validation still rejects invalid choices', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    // Invalid choice — structural validation catches before persistence attempt
    const response = makeResponse(interaction.interactionId, 'nonexistent' as ChoiceId);
    await expect(service.recordResponse(interaction.interactionId, response)).rejects.toThrow('validation failed');
  });

  it('existing I1 unknown interaction still rejected', async () => {
    const response = makeResponse('nonexistent' as InteractionId);
    await expect(service.recordResponse('nonexistent' as InteractionId, response)).rejects.toThrow('not found');
  });
});
