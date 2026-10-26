import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteInteractionStore } from '../src/sqlite-store';

function interaction(id: string) {
  return {
    interactionId: id,
    presentingParticipantId: 'system',
    presentingParticipantName: 'System',
    createdAt: new Date().toISOString(),
    content: 'Proceed?',
    choices: [{ choiceId: 'yes', label: 'Yes' }],
  } as never;
}

describe('SqliteInteractionStore contract', () => {
  it('puts, gets, checks, and rejects duplicate interactions', async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-interact-')), 'store.db');
    const store = await SqliteInteractionStore.open(dbPath);
    try {
      await store.put(interaction('i1'));
      expect(await store.has('i1' as never)).toBe(true);
      expect(await store.has('missing' as never)).toBe(false);
      expect((await store.get('i1' as never))?.interaction.interactionId).toBe('i1');
      await expect(store.put(interaction('i1'))).rejects.toThrow();
    } finally {
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    }
  });
});
