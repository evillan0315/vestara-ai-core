import type { MemoryEntry } from '@vestara/types';
import { MemoryEntrySchema } from '@vestara/types';
export class MemoryLayer {
  constructor(private readonly db: { prepare: (sql: string) => any }) {}
  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validated = MemoryEntrySchema.parse({ ...entry, id, createdAt: now, updatedAt: now });
    this.db
      .prepare(
        `INSERT INTO memory_entries (id, workspace_id, kind, content, created_at, updated_at, verified) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        validated.id,
        validated.workspaceId,
        validated.kind,
        validated.content,
        validated.createdAt,
        validated.updatedAt,
        validated.verified ? 1 : 0,
      );
    return validated;
  }
  async recall(workspaceId: string, query: string, limit = 10): Promise<MemoryEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_entries WHERE workspace_id = ? AND content LIKE ? ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(workspaceId, `%${query}%`, limit) as MemoryEntry[];
    return rows;
  }
}
