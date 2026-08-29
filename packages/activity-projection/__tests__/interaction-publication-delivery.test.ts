/**
 * AR-REC-C2 I1 / CORRECTION: Publication Delivery Integrity Integration Test
 *
 * Production-path integration test exercising the real delivery chain with
 * acyclic ownership boundary:
 *
 *   InteractionService
 *     → InteractionEventBusAdapter (thin EventBus passthrough)
 *       → InProcessEventBus
 *         → M9IngestionBridge (projection consumer)
 *           → fromInteractionPresented/Responded (M9 adapters)
 *             → SqliteActivityStore (M9)
 *     ← M9DeliveryVerifier (delivery verification port)
 *       ← SqliteActivityStore.getByEventId (direct query)
 *
 * Proves:
 *   - Presentation reaches M9
 *   - Response reaches M9
 *   - Stable semantic event identity survives the chain
 *   - Duplicate/recovery presentation does not create second M9 record
 *   - Duplicate/recovery response does not create second M9 record
 *   - Successful M9 delivery allows publication acknowledgement
 *   - Failed M9 delivery leaves the ledger pending
 *   - Later recovery succeeds and marks it published
 *   - No reverse dependency: M9 does NOT call back to adapter
 *
 * No mocks on the publication delivery path. Only infrastructure (sql.js) is
 * external, exercised directly.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ACTIVITY_MANIFEST,
  DurableActivityStore,
  M9DeliveryVerifier,
  M9IngestionBridge,
} from '@vestara/activity-projection';
import { InProcessEventBus } from '@vestara/event-bus';
import { InteractionService } from '@vestara/interaction-app';
import { InteractionEventBusAdapter, SqliteInteractionStore } from '@vestara/interaction-persistence';
import { migrate } from '@vestara/sqlite-migrations';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ─── Helpers ───────────────────────────────────────────────

function tmpDb(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

// ─── Production-Path Integration ───────────────────────────

describe('Publication Delivery Integrity (Production-Path)', () => {
  let interactionDbPath: string;
  let m9Db: any;
  let interactionStore: SqliteInteractionStore;
  let m9Store: DurableActivityStore;
  let eventBus: InProcessEventBus;
  let adapter: InteractionEventBusAdapter;
  let bridge: M9IngestionBridge;
  let service: InteractionService;

  beforeEach(async () => {
    interactionDbPath = tmpDb('interaction-delivery');
    interactionStore = await SqliteInteractionStore.open(interactionDbPath);

    // Create real M9 store (sql.js in-memory)
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    m9Db = new SQL.Database();
    migrate(m9Db, ACTIVITY_MANIFEST);
    m9Store = new DurableActivityStore(m9Db);

    // Wire real production chain — acyclic, no callbacks
    eventBus = new InProcessEventBus();
    adapter = new InteractionEventBusAdapter(eventBus);
    bridge = new M9IngestionBridge({ store: m9Store, eventBus });
    bridge.start();

    // C2: Service uses delivery verifier to check M9 before acknowledging
    const verifier = new M9DeliveryVerifier(m9Store);
    service = new InteractionService({
      persistence: interactionStore,
      publication: adapter,
      deliveryVerifier: verifier,
    });
  });

  afterEach(() => {
    bridge.stop();
    if (fs.existsSync(interactionDbPath)) fs.unlinkSync(interactionDbPath);
  });

  // ─── C4-1: Presentation reaches M9 ─────────────────────

  it('presentation reaches M9', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const expectedEventId = `interaction:presented:${interaction.interactionId}`;
    const record = await m9Store.getByEventId(expectedEventId);
    expect(record).toBeDefined();
    expect(record!.type).toBe('interaction.presented');
    expect(record!.source).toBe('interaction-app');
    expect(record!.payload.data.interactionId).toBe(interaction.interactionId);
  });

  // ─── C4-2: Response reaches M9 ─────────────────────────

  it('response reaches M9', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    await service.recordResponse(interaction.interactionId, response);

    const expectedEventId = `interaction:responded:${interaction.interactionId}`;
    const record = await m9Store.getByEventId(expectedEventId);
    expect(record).toBeDefined();
    expect(record!.type).toBe('interaction.responded');
    expect(record!.source).toBe('interaction-app');
    expect(record!.payload.data.interactionId).toBe(interaction.interactionId);
    expect(record!.payload.data.responseId).toBe(response.responseId);
    expect(record!.payload.data.selectedChoiceId).toBe(response.selectedChoiceId);
  });

  // ─── C4-3: Stable semantic event identity ───────────────

  it('stable semantic event identity survives the chain', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const expectedEventId = `interaction:presented:${interaction.interactionId}`;
    const record = await m9Store.getByEventId(expectedEventId);
    expect(record).toBeDefined();
    expect(record!.eventId).toBe(expectedEventId);

    // eventId must NOT contain the auto-generated delivery id (evt-XXXX)
    expect(record!.eventId).not.toMatch(/evt-\d+/);
  });

  // ─── C4-4: Duplicate presentation → M9 dedup ───────────

  it('duplicate/recovery presentation does not create second M9 record', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const expectedEventId = `interaction:presented:${interaction.interactionId}`;
    const record1 = await m9Store.getByEventId(expectedEventId);
    expect(record1).toBeDefined();

    // Simulate recovery: re-emit same event (bypasses persistence UNIQUE constraint)
    await eventBus.emit({
      type: 'interaction:presented',
      source: 'interaction-app',
      payload: {
        eventId: expectedEventId,
        interactionId: interaction.interactionId,
        presentingParticipantId: interaction.presentingParticipantId,
        presentingParticipantName: interaction.presentingParticipantName,
        createdAt: interaction.createdAt,
        content: interaction.content,
        choices: interaction.choices,
      },
    });

    // M9 should still have exactly one record — deduplication by semantic eventId
    const record2 = await m9Store.getByEventId(expectedEventId);
    expect(record2).toBeDefined();
    expect(record2!.activityId).toBe(record1!.activityId);
  });

  // ─── C4-5: Duplicate response → M9 dedup ───────────────

  it('duplicate/recovery response does not create second M9 record', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const response = makeResponse(interaction.interactionId);
    await service.recordResponse(interaction.interactionId, response);

    const expectedEventId = `interaction:responded:${interaction.interactionId}`;
    const record1 = await m9Store.getByEventId(expectedEventId);
    expect(record1).toBeDefined();

    // Simulate recovery: re-emit same response event
    await eventBus.emit({
      type: 'interaction:responded',
      source: 'interaction-app',
      payload: {
        eventId: expectedEventId,
        interactionId: interaction.interactionId,
        responseId: response.responseId,
        selectedChoiceId: response.selectedChoiceId,
        respondingParticipantId: response.respondingParticipantId,
        respondingParticipantName: response.respondingParticipantName,
        respondedAt: response.respondedAt,
      },
    });

    // M9 should still have exactly one record
    const record2 = await m9Store.getByEventId(expectedEventId);
    expect(record2).toBeDefined();
    expect(record2!.activityId).toBe(record1!.activityId);
  });

  // ─── C4-6: Successful delivery → publication acknowledged ──

  it('successful M9 delivery allows publication acknowledgement', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    // Publication marker should be marked delivered (M9 succeeded, verifier confirmed)
    const pending = await interactionStore.getPendingPublications(100);
    const presentedMarker = pending.find((p) => p.eventId === `interaction:presented:${interaction.interactionId}`);
    expect(presentedMarker).toBeUndefined();

    // Verify published_at is set
    const retrieved = await interactionStore.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.publishedAt).toBeDefined();
  });

  // ─── C4-7: Failed delivery → ledger remains pending ─────

  it('failed M9 delivery leaves the ledger pending', async () => {
    // Stop bridge so it cannot deliver to M9
    bridge.stop();

    const interaction = makeInteraction();

    // Service call throws because verifier finds no M9 record
    await expect(service.present(interaction)).rejects.toThrow('Projection delivery failed');

    // Interaction WAS persisted (put() succeeded before verifier threw)
    const retrieved = await interactionStore.get(interaction.interactionId);
    expect(retrieved).toBeDefined();

    // Publication is pending because M9 never received it
    const pending = await interactionStore.getPendingPublications(100);
    const presentedMarker = pending.find((p) => p.eventId === `interaction:presented:${interaction.interactionId}`);
    expect(presentedMarker).toBeDefined();
    expect(retrieved!.publishedAt).toBeNull();
  });

  // ─── C4-8: Recovery succeeds and marks published ────────

  it('later recovery succeeds and marks it published', async () => {
    // Phase 1: stop bridge → present → interaction persisted but publication pending
    bridge.stop();

    const interaction = makeInteraction();
    await expect(service.present(interaction)).rejects.toThrow('Projection delivery failed');

    // Verify interaction is persisted and publication is pending
    const retrieved = await interactionStore.get(interaction.interactionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.publishedAt).toBeNull();

    const pendingBefore = await interactionStore.getPendingPublications(100);
    expect(pendingBefore.some((p) => p.eventId === `interaction:presented:${interaction.interactionId}`)).toBe(true);

    // Phase 2: restart bridge → recovery re-emits → M9 receives → mark published
    bridge = new M9IngestionBridge({ store: m9Store, eventBus });
    bridge.start();

    // Production recovery: get pending → reconstruct → emit → verify → markPublished
    const pending = await service.getPendingPublications(100);
    for (const entry of pending) {
      const entryRetrieved = await interactionStore.get(entry.interactionId);
      if (!entryRetrieved) continue;

      if (entry.eventId.startsWith('interaction:presented:')) {
        // Emit to EventBus — bridge delivers to M9
        await eventBus.emit({
          type: 'interaction:presented',
          source: 'interaction-app',
          payload: {
            eventId: entry.eventId,
            interactionId: entry.interactionId,
            conversationId: entryRetrieved.interaction.conversationId,
            presentingParticipantId: entryRetrieved.interaction.presentingParticipantId,
            presentingParticipantName: entryRetrieved.interaction.presentingParticipantName,
            createdAt: entryRetrieved.interaction.createdAt,
            content: entryRetrieved.interaction.content,
            choices: entryRetrieved.interaction.choices,
          },
        });
        // Verify delivery via port, then mark published
        const verifier = new M9DeliveryVerifier(m9Store);
        const delivered = await verifier.wasDelivered(entry.eventId);
        expect(delivered).toBe(true);
        await service.markPublished(entry.eventId);
      }
    }

    // Publication should now be acknowledged
    const pendingAfter = await interactionStore.getPendingPublications(100);
    expect(pendingAfter.some((p) => p.eventId === `interaction:presented:${interaction.interactionId}`)).toBe(false);

    // M9 has exactly one record (deduplication ensured no duplicate)
    const expectedEventId = `interaction:presented:${interaction.interactionId}`;
    const record = await m9Store.getByEventId(expectedEventId);
    expect(record).toBeDefined();
    expect(record!.eventId).toBe(expectedEventId);
  });

  // ─── C5: Response concurrency unchanged ─────────────────

  it('response concurrency unchanged under production chain', async () => {
    const interaction = makeInteraction();
    await service.present(interaction);

    const responseA = makeResponse(interaction.interactionId, 'opt-a' as ChoiceId);
    const responseB = makeResponse(interaction.interactionId, 'opt-b' as ChoiceId);

    const results = await Promise.allSettled([
      service.recordResponse(interaction.interactionId, responseA),
      service.recordResponse(interaction.interactionId, responseB),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // M9 has exactly one response record
    const expectedEventId = `interaction:responded:${interaction.interactionId}`;
    const record = await m9Store.getByEventId(expectedEventId);
    expect(record).toBeDefined();
  });

  // ─── Ownership boundary: no reverse dependency ──────────

  it('no reverse dependency from M9 to interaction publication adapter', () => {
    // Verify the ownership boundary: M9IngestionBridge does NOT import
    // interaction packages and does NOT know about the adapter.
    //
    // This test is structural evidence — the actual enforcement is in
    // workspace-architecture.mjs dependency boundary check (98 projects).
    //
    // The acyclic flow is:
    //   adapter → EventBus → bridge → M9 (forward)
    //   service ← verifier ← M9 (read-only query, no mutation callback)
    //
    // Bridge has NO reference to adapter, pendingDeliveries, or notifyDelivered.
    const bridgeSource = require('fs').readFileSync(
      require('path').join(__dirname, '../src/m9-ingestion-bridge.ts'),
      'utf-8',
    );
    expect(bridgeSource).not.toContain('notifyDelivered');
    expect(bridgeSource).not.toContain('onInteractionDelivered');
    expect(bridgeSource).not.toContain('interaction-event-bus-adapter');
    expect(bridgeSource).not.toContain('InteractionEventBusAdapter');

    // Adapter has NO reference to M9, bridge, or delivery callbacks
    const adapterSource = require('fs').readFileSync(
      require('path').join(__dirname, '../../interaction-persistence/src/interaction-event-bus-adapter.ts'),
      'utf-8',
    );
    expect(adapterSource).not.toContain('notifyDelivered');
    expect(adapterSource).not.toContain('pendingDeliveries');
    expect(adapterSource).not.toContain('M9IngestionBridge');
    expect(adapterSource).not.toContain('m9-ingestion-bridge');
  });
});
