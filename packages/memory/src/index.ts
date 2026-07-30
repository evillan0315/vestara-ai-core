/**
 * @vestara/memory — Layered Memory Runtime
 *
 * Four-layer memory architecture: working (session), episodic (recent
 * events), semantic (facts/knowledge), long-term (consolidated).
 * Automatic importance scoring and consolidation.
 *
 * Architecture Traceability:
 *   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Memory
 *   Specification: AI-CON-001 → Memory Engine
 *   Blueprint: 05-ai-core/memory/01-memory-architecture.md
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { Runtime, type RuntimeId, type RuntimeType } from '@vestara/runtime';

// ─── Types ──────────────────────────────────────────────────

export type MemoryType = 'fact' | 'preference' | 'event' | 'decision';

export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'long-term';

export interface Memory {
  id: string;
  userId: string;
  type: MemoryType;
  layer: MemoryLayer;
  content: string;
  summary?: string;
  importance: number; // 0.0 — 10.0
  tags: string[];
  source?: string; // conversation, action, explicit, system
  metadata: Record<string, unknown>;
  consolidatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryInput {
  type: MemoryType;
  content: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  memories: Memory[];
  total: number;
  query: string;
}

export interface ConsolidationReport {
  processed: number;
  archived: number;
  pruned: number;
  promoted: number; // working → long-term
  duration: number;
}

// ─── Scoring Weights ────────────────────────────────────────

const SCORE_WEIGHTS = {
  recency: 0.3,
  frequency: 0.2,
  userFeedback: 0.2,
  novelty: 0.15,
  impact: 0.15,
};

// ─── Memory Runtime Interface ───────────────────────────────

export interface MemoryRuntime {
  /** Store a new memory */
  store(userId: string, input: MemoryInput): Promise<Memory>;
  /** Search memories across all layers */
  search(userId: string, query: string, limit?: number): Promise<MemorySearchResult>;
  /** Get top N memories for context assembly */
  getContext(userId: string, limit?: number): Promise<Memory[]>;
  /** Set importance score explicitly */
  setImportance(memoryId: string, score: number): Promise<void>;
  /** Trigger consolidation cycle */
  consolidate(userId: string): Promise<ConsolidationReport>;
  /** Delete a memory */
  delete(memoryId: string): Promise<void>;
  /** Get memory statistics */
  stats(userId: string): Promise<MemoryStats>;
}

export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  byLayer: Record<MemoryLayer, number>;
  avgImportance: number;
  oldestMemory: string;
  newestMemory: string;
}

// ─── SQLite Implementation ──────────────────────────────────

let SQL: any = null;

async function getDb(): Promise<any> {
  if (SQL) return SQL;
  const { getSql } = await import('@vestara/shared');
  SQL = await getDb();
  return SQL;
}

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const r = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return r;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

let memCounter = 0;
function genId(): string {
  return `mem-${Date.now()}-${++memCounter}`;
}

// ─── Importance Scoring ─────────────────────────────────────

function calculateImportance(params: {
  ageHours: number;
  accessCount: number;
  userScore?: number;
  semanticNovelty: number;
  hasImpact: boolean;
}): number {
  const recencyScore = Math.max(0, 10 - params.ageHours / 24); // Decays over days
  const frequencyScore = Math.min(10, params.accessCount * 2);
  const noveltyScore = params.semanticNovelty;
  const impactScore = params.hasImpact ? 10 : 1;

  return Math.round(
    recencyScore * SCORE_WEIGHTS.recency +
      frequencyScore * SCORE_WEIGHTS.frequency +
      (params.userScore ?? 5 * SCORE_WEIGHTS.userFeedback) +
      noveltyScore * SCORE_WEIGHTS.novelty +
      impactScore * SCORE_WEIGHTS.impact,
  );
}

// ─── DefaultMemoryRuntime ───────────────────────────────────

export class DefaultMemoryRuntime extends Runtime implements MemoryRuntime {
  private db: any = null;
  private logger?: Logger;
  private eventBus?: EventBus;
  private initialized = false;
  constructor(opts?: { logger?: Logger; eventBus?: EventBus }) {
    const runtimeId = `memory:${Date.now()}` as unknown as RuntimeId;
    super(
      {
        id: runtimeId,
        type: 'runtime' as RuntimeType,
        name: 'Memory Runtime',
        eventBus: opts?.eventBus,
      },
      {
        onInitialize: async () => {
          this.ensureSchema();
          this.initialized = true;
          this.logger?.info('Memory runtime initialized');
        },
      },
    );

    this.logger = opts?.logger?.child({ component: 'memory' });
    this.eventBus = opts?.eventBus;
  }

  async initialize(db?: any): Promise<void> {
    if (db) {
      this.db = db;
    } else if (!this.db) {
      const SQL = await getDb();
      this.db = new SQL.Database();
    }
    await super.initialize();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, user_id TEXT, type TEXT, layer TEXT,
        content TEXT, summary TEXT, importance REAL DEFAULT 1.0,
        tags TEXT DEFAULT '[]', source TEXT, metadata TEXT DEFAULT '{}',
        consolidated_at TEXT, created_at TEXT, updated_at TEXT,
        access_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id, importance DESC);
      CREATE INDEX IF NOT EXISTS idx_mem_user_layer ON memories(user_id, layer);
      CREATE INDEX IF NOT EXISTS idx_mem_user_type ON memories(user_id, type);
      CREATE INDEX IF NOT EXISTS idx_mem_created ON memories(user_id, created_at);
    `);
  }

  // ─── Store ────────────────────────────────────────────────

  async store(userId: string, input: MemoryInput): Promise<Memory> {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const existing = dbGet(
      this.db,
      'SELECT id, access_count FROM memories WHERE user_id = ? AND content = ? AND type = ? LIMIT 1',
      [userId, input.content, input.type],
    );

    if (existing) {
      // Update existing memory (boost importance from repetition)
      dbRun(this.db, 'UPDATE memories SET updated_at = ?, access_count = access_count + 1 WHERE id = ?', [
        now,
        existing.id,
      ]);
      const mem = await this.get(existing.id);
      if (mem) await this.recalculateImportance(mem);
      return mem!;
    }

    const id = genId();
    const layer: MemoryLayer = this.detectLayer(input);

    dbRun(
      this.db,
      `INSERT INTO memories (id, user_id, type, layer, content, tags, source, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        input.type,
        layer,
        input.content,
        JSON.stringify(input.tags ?? []),
        input.source ?? null,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );

    const memory = await this.get(id);
    if (memory) await this.recalculateImportance(memory);

    await this.eventBus?.emit({
      type: 'memory:stored',
      source: 'memory-runtime',
      payload: { memoryId: id, userId, type: input.type, layer, importance: memory?.importance },
    });

    return memory!;
  }

  private detectLayer(input: MemoryInput): MemoryLayer {
    // Facts and preferences go to semantic layer
    if (input.type === 'fact' || input.type === 'preference') return 'semantic';
    // Decisions go to long-term
    if (input.type === 'decision') return 'long-term';
    // Events start in episodic
    return 'episodic';
  }

  private async get(id: string): Promise<Memory | null> {
    const row = dbGet(this.db, 'SELECT * FROM memories WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToMemory(row);
  }

  // ─── Search ────────────────────────────────────────────────

  async search(userId: string, query: string, limit = 20): Promise<MemorySearchResult> {
    this.ensureInitialized();
    const term = `%${query}%`;
    const rows = dbAll(
      this.db,
      `SELECT * FROM memories WHERE user_id = ? AND (content LIKE ? OR summary LIKE ? OR tags LIKE ?)
       ORDER BY importance DESC, created_at DESC LIMIT ?`,
      [userId, term, term, term, limit],
    );
    return {
      memories: rows.map((r: any) => this.rowToMemory(r)),
      total: rows.length,
      query,
    };
  }

  // ─── Context Assembly ─────────────────────────────────────

  async getContext(userId: string, limit = 50): Promise<Memory[]> {
    this.ensureInitialized();
    // Get top N most important memories (mix of layers)
    const rows = dbAll(
      this.db,
      `SELECT * FROM memories WHERE user_id = ?
       ORDER BY importance DESC, created_at DESC LIMIT ?`,
      [userId, limit],
    );
    return rows.map((r: any) => this.rowToMemory(r));
  }

  // ─── Importance ───────────────────────────────────────────

  async setImportance(memoryId: string, score: number): Promise<void> {
    this.ensureInitialized();
    dbRun(this.db, 'UPDATE memories SET importance = ?, updated_at = ? WHERE id = ?', [
      Math.max(0, Math.min(10, score)),
      new Date().toISOString(),
      memoryId,
    ]);
  }

  private async recalculateImportance(memory: Memory): Promise<void> {
    const row = dbGet(this.db, 'SELECT access_count, created_at FROM memories WHERE id = ?', [memory.id]);
    if (!row) return;

    const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3600000;
    const score = calculateImportance({
      ageHours,
      accessCount: row.access_count,
      semanticNovelty: memory.content.length > 100 ? 7 : 4,
      hasImpact: memory.source === 'action' || memory.type === 'decision',
    });

    dbRun(this.db, 'UPDATE memories SET importance = ? WHERE id = ?', [score, memory.id]);
  }

  // ─── Consolidation ─────────────────────────────────────────

  async consolidate(userId: string): Promise<ConsolidationReport> {
    this.ensureInitialized();
    const start = performance.now();
    const report: ConsolidationReport = { processed: 0, archived: 0, pruned: 0, promoted: 0, duration: 0 };

    // Get all memories for user ordered by importance
    const rows = dbAll(this.db, 'SELECT * FROM memories WHERE user_id = ? ORDER BY importance ASC', [userId]);
    report.processed = rows.length;

    for (const row of rows) {
      const memory = this.rowToMemory(row);

      if (memory.importance < 1.5 && this.isOlderThan(memory, 90)) {
        // Prune: very low importance and older than 90 days
        dbRun(this.db, 'DELETE FROM memories WHERE id = ?', [memory.id]);
        report.pruned++;
      } else if (memory.importance > 7 && memory.layer !== 'long-term') {
        // Promote: high importance memories to long-term
        dbRun(this.db, "UPDATE memories SET layer = 'long-term', consolidated_at = ?, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          new Date().toISOString(),
          memory.id,
        ]);
        report.promoted++;
      } else if (memory.importance < 3 && memory.layer === 'episodic') {
        // Archive: low importance episodic memories
        dbRun(
          this.db,
          "UPDATE memories SET layer = 'semantic', summary = substr(content, 1, 100), consolidated_at = ? WHERE id = ?",
          [new Date().toISOString(), memory.id],
        );
        report.archived++;
      }
    }

    report.duration = Math.round(performance.now() - start);

    await this.eventBus?.emit({
      type: 'memory:consolidated',
      source: 'memory-runtime',
      payload: { userId, ...report },
    });

    this.logger?.info('Memory consolidation completed', { ...report });
    return report;
  }

  // ─── Delete ───────────────────────────────────────────────

  async delete(memoryId: string): Promise<void> {
    this.ensureInitialized();
    dbRun(this.db, 'DELETE FROM memories WHERE id = ?', [memoryId]);
    await this.eventBus?.emit({
      type: 'memory:deleted',
      source: 'memory-runtime',
      payload: { memoryId },
    });
  }

  // ─── Stats ────────────────────────────────────────────────

  async stats(userId: string): Promise<MemoryStats> {
    this.ensureInitialized();
    const total = dbGet(this.db, 'SELECT COUNT(*) as c FROM memories WHERE user_id = ?', [userId])?.c ?? 0;

    const byType: Record<string, number> = {};
    for (const t of ['fact', 'preference', 'event', 'decision']) {
      byType[t] =
        dbGet(this.db, 'SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND type = ?', [userId, t])?.c ?? 0;
    }

    const byLayer: Record<string, number> = {};
    for (const l of ['working', 'episodic', 'semantic', 'long-term']) {
      byLayer[l] =
        dbGet(this.db, 'SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND layer = ?', [userId, l])?.c ?? 0;
    }

    const avgRow = dbGet(this.db, 'SELECT AVG(importance) as avg FROM memories WHERE user_id = ?', [userId]);
    const oldest = dbGet(this.db, 'SELECT created_at FROM memories WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [
      userId,
    ]);
    const newest = dbGet(
      this.db,
      'SELECT created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId],
    );

    return {
      total,
      byType: byType as Record<MemoryType, number>,
      byLayer: byLayer as Record<MemoryLayer, number>,
      avgImportance: Math.round((avgRow?.avg ?? 0) * 10) / 10,
      oldestMemory: oldest?.created_at ?? '',
      newestMemory: newest?.created_at ?? '',
    };
  }

  // ─── Helpers ──────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this.initialized) throw new Error('Memory runtime not initialized');
  }

  private isOlderThan(memory: Memory, days: number): boolean {
    return Date.now() - new Date(memory.createdAt).getTime() > days * 86400000;
  }

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      layer: row.layer,
      content: row.content,
      summary: row.summary ?? undefined,
      importance: row.importance,
      tags: JSON.parse(row.tags ?? '[]'),
      source: row.source ?? undefined,
      metadata: JSON.parse(row.metadata ?? '{}'),
      consolidatedAt: row.consolidated_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
