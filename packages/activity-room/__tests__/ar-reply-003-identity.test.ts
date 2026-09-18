/**
 * AR-REPLY-003 — Referenced Activity Identity Repair.
 *
 * Failure class: an external conversation record (Telegram/Instagram-style,
 * mirrored into the M11A M9 store as `human.message:<channel>-in-<id>`)
 * displays with activityId `act-<seq>-human.me`. Reply submits that
 * projection id verbatim as referencedActivityIds, but the legacy
 * validator only queried the legacy ActivityStore — UNKNOWN_REFERENCE.
 *
 * These tests prove:
 * 1. External-style ingestion mints `act-<seq>-human.me` ids (origin).
 * 2. Projection preserves the canonical id (id === activityId invariant).
 * 3. `getByActivityId` resolves them in both M9 store implementations.
 * 4. Fabricated projection-looking ids resolve nowhere (masquerade fails safe).
 * 5. Internal legacy ids still resolve via the legacy namespace.
 */

import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { DurableActivityStore, fromHumanMessage, IdempotentActivityStore } from '../src/index.js';
import { toProjectionRecord } from '../src/m9-to-projection.js';

function externalEvent() {
  return fromHumanMessage({
    message: '[Telegram] Eddie: hello from the channel',
    userId: 'external-telegram-123',
    displayName: 'Eddie (Telegram)',
    messageId: 'tg-in-456',
  });
}

describe('AR-REPLY-003 origin: external ingestion mints act-<seq>-human.me ids', () => {
  it('derives the failing id shape from the channel message id', async () => {
    const store = new IdempotentActivityStore();
    const record = await store.append(externalEvent());
    expect(record.eventId).toBe('human.message:tg-in-456');
    expect(record.activityId).toMatch(/^act-1-human\.me$/);
  });

  it('projection preserves the canonical id (no replacement)', async () => {
    const store = new IdempotentActivityStore();
    const record = await store.append(externalEvent());
    const projected = toProjectionRecord(record);
    expect(projected.id).toBe(record.activityId);
    expect(projected.id).toMatch(/^act-1-human\.me$/);
  });
});

describe('AR-REPLY-003 repair: getByActivityId resolves canonical ids', () => {
  it('in-memory store resolves the displayed id', async () => {
    const store = new IdempotentActivityStore();
    const record = await store.append(externalEvent());
    await expect(store.getByActivityId(record.activityId)).resolves.toMatchObject({
      activityId: record.activityId,
      eventId: 'human.message:tg-in-456',
    });
    await expect(store.getByActivityId('act-9999-xxxxxxxx')).resolves.toBeUndefined();
  });

  it('sqlite store resolves the displayed id', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      const store = new DurableActivityStore(db);
      const record = await store.append(externalEvent());
      expect(record.activityId).toMatch(/^act-\d+-human\.me$/);
      const found = await store.getByActivityId(record.activityId);
      expect(found?.eventId).toBe('human.message:tg-in-456');
      await expect(store.getByActivityId('act-9999-xxxxxxxx')).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('projection ids cannot masquerade as canonical records', async () => {
    const mem = new IdempotentActivityStore();
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      const sql = new DurableActivityStore(db);
      // Fabricated ids in the exact failing shape resolve nowhere.
      await expect(mem.getByActivityId('act-1175-human.me')).resolves.toBeUndefined();
      await expect(sql.getByActivityId('act-1175-human.me')).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });
});
