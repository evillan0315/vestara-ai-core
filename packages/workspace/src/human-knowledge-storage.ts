/**
 * HumanKnowledgeStorage — SQLite-backed persistence for governed human knowledge.
 *
 * Scope rules (HUMAN-CONTEXT-003):
 * - Every operation requires the owning principalId. Reads, updates, and
 *   deletes are keyed by (principalId, itemId); cross-principal access is
 *   impossible by construction, not by convention.
 * - Unknown principalIds fail deterministically (HumanPrincipalNotFoundError).
 * - Default-deny: omitted sensitivity → PRIVATE, omitted agentReadable → false.
 *   Confidence is explicitly required — never defaulted or derived from
 *   verificationStatus.
 * - `subdomain` is immutable after creation (it is the closed policy axis;
 *   recategorization is delete + create, both auditable).
 * - Items persist as structured data (JSON value + JSON metadata columns).
 *   Provenance, subjects, epistemic status, and sensitivity are never
 *   flattened into biography text.
 * - No interaction with the memory subsystems, no prompt/execution rendering.
 *   This module imports identity + contracts only.
 * - Schema is owned by the migration chain (`human-knowledge-migrations.ts`).
 * - All SQL is parameterized (prepare + bind, no interpolation).
 */

import * as crypto from 'node:crypto';
import type {
  HumanKnowledgeInput,
  HumanKnowledgeItem,
  HumanKnowledgeMeta,
  HumanKnowledgeSubdomain,
  HumanKnowledgeUpdate,
  HumanSensitivity,
  HumanTimeRange,
  HumanVerificationStatus,
} from './human-knowledge';
import {
  HUMAN_KNOWLEDGE_DEFAULT_AGENT_READABLE,
  HUMAN_KNOWLEDGE_DEFAULT_SENSITIVITY,
  isHumanKnowledgeSubdomain,
  isHumanSensitivity,
  isHumanVerificationStatus,
  isValidHumanConfidence,
} from './human-knowledge';
import { HumanPrincipalNotFoundError, HumanPrincipalStorage } from './human-principal-storage';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function genId(): string {
  return `hk-${crypto.randomBytes(8).toString('hex')}`;
}

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new Error('Corrupt string-array column in human knowledge store');
  }
  return parsed;
}

function parseTimeRange(raw: unknown): HumanTimeRange | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') throw new Error('Corrupt time_range column in human knowledge store');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Corrupt time_range column in human knowledge store');
  }
  const record = parsed as Record<string, unknown>;
  const range: HumanTimeRange = {};
  if (record.from !== undefined) {
    if (typeof record.from !== 'string') throw new Error('Corrupt time_range.from in human knowledge store');
    range.from = record.from;
  }
  if (record.to !== undefined) {
    if (typeof record.to !== 'string') throw new Error('Corrupt time_range.to in human knowledge store');
    range.to = record.to;
  }
  if (record.approximate !== undefined) {
    if (typeof record.approximate !== 'boolean') {
      throw new Error('Corrupt time_range.approximate in human knowledge store');
    }
    range.approximate = record.approximate;
  }
  return range;
}

export interface HumanKnowledgeFilter {
  subdomain?: HumanKnowledgeSubdomain;
}

export class HumanKnowledgeStorage {
  private db: any;
  private principals: HumanPrincipalStorage;

  constructor(db: any, principals?: HumanPrincipalStorage) {
    this.db = db;
    // Schema is owned by the migration chain (human-knowledge-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
    this.principals = principals ?? new HumanPrincipalStorage(db);
  }

  async create<T = string>(principalId: string, input: HumanKnowledgeInput<T>): Promise<HumanKnowledgeItem<T>> {
    await this._requirePrincipal(principalId);
    if (!isHumanKnowledgeSubdomain(input.subdomain)) {
      throw new Error(`Invalid knowledge subdomain: ${String(input.subdomain)}`);
    }
    if (typeof input.kind !== 'string' || input.kind.length === 0) throw new Error('kind is required');
    const meta = this._checkedMeta(input.meta);
    const now = new Date().toISOString();
    const item: HumanKnowledgeItem<T> = {
      id: genId(),
      principalId,
      subdomain: input.subdomain,
      kind: input.kind,
      value: input.value,
      meta,
      createdAt: now,
      updatedAt: now,
    };
    dbRun(
      this.db,
      `INSERT INTO human_knowledge_items
       (id, principal_id, subdomain, kind, value, source, provenance, time_range,
        verification_status, confidence, sensitivity, agent_readable,
        primary_subject_ref, related_subject_refs, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.principalId,
        item.subdomain,
        item.kind,
        JSON.stringify(item.value),
        item.meta.source,
        JSON.stringify(item.meta.provenance),
        item.meta.timeRange ? JSON.stringify(item.meta.timeRange) : null,
        item.meta.verificationStatus,
        item.meta.confidence,
        item.meta.sensitivity,
        item.meta.agentReadable ? 1 : 0,
        item.meta.primarySubjectRef ?? null,
        JSON.stringify(item.meta.relatedSubjectRefs),
        item.createdAt,
        item.updatedAt,
      ],
    );
    return item;
  }

  async get<T = string>(principalId: string, itemId: string): Promise<HumanKnowledgeItem<T> | null> {
    await this._requirePrincipal(principalId);
    const row = dbGet(this.db, 'SELECT * FROM human_knowledge_items WHERE id = ? AND principal_id = ?', [
      itemId,
      principalId,
    ]);
    return row ? this._rowToItem<T>(row) : null;
  }

  async require<T = string>(principalId: string, itemId: string): Promise<HumanKnowledgeItem<T>> {
    const item = await this.get<T>(principalId, itemId);
    if (!item) throw new Error(`Human knowledge item not found: ${itemId} for principal ${principalId}`);
    return item;
  }

  async list<T = string>(principalId: string, filter: HumanKnowledgeFilter = {}): Promise<HumanKnowledgeItem<T>[]> {
    await this._requirePrincipal(principalId);
    if (filter.subdomain !== undefined && !isHumanKnowledgeSubdomain(filter.subdomain)) {
      throw new Error(`Invalid knowledge subdomain: ${String(filter.subdomain)}`);
    }
    const rows =
      filter.subdomain === undefined
        ? dbAll(this.db, 'SELECT * FROM human_knowledge_items WHERE principal_id = ? ORDER BY created_at ASC', [
            principalId,
          ])
        : dbAll(
            this.db,
            'SELECT * FROM human_knowledge_items WHERE principal_id = ? AND subdomain = ? ORDER BY created_at ASC',
            [principalId, filter.subdomain],
          );
    return rows.map((row) => this._rowToItem<T>(row));
  }

  async update<T = string>(
    principalId: string,
    itemId: string,
    update: HumanKnowledgeUpdate<T>,
  ): Promise<HumanKnowledgeItem<T>> {
    const current = await this.require<T>(principalId, itemId);
    const kind = update.kind ?? current.kind;
    if (typeof kind !== 'string' || kind.length === 0) throw new Error('kind is required');
    const meta: HumanKnowledgeMeta = {
      ...current.meta,
      ...(update.meta ?? {}),
      provenance: update.meta?.provenance ?? current.meta.provenance,
      relatedSubjectRefs: update.meta?.relatedSubjectRefs ?? current.meta.relatedSubjectRefs,
    };
    this._checkedMeta({ ...meta, sensitivity: meta.sensitivity, agentReadable: meta.agentReadable });
    const now = new Date().toISOString();
    dbRun(
      this.db,
      `UPDATE human_knowledge_items
       SET kind = ?, value = ?, source = ?, provenance = ?, time_range = ?,
           verification_status = ?, confidence = ?, sensitivity = ?, agent_readable = ?,
           primary_subject_ref = ?, related_subject_refs = ?, updated_at = ?
       WHERE id = ? AND principal_id = ?`,
      [
        kind,
        JSON.stringify(update.value !== undefined ? update.value : current.value),
        meta.source,
        JSON.stringify(meta.provenance),
        meta.timeRange ? JSON.stringify(meta.timeRange) : null,
        meta.verificationStatus,
        meta.confidence,
        meta.sensitivity,
        meta.agentReadable ? 1 : 0,
        meta.primarySubjectRef ?? null,
        JSON.stringify(meta.relatedSubjectRefs),
        now,
        itemId,
        principalId,
      ],
    );
    return this.require<T>(principalId, itemId);
  }

  async delete(principalId: string, itemId: string): Promise<boolean> {
    await this._requirePrincipal(principalId);
    const existing = await this.get(principalId, itemId);
    if (!existing) return false;
    dbRun(this.db, 'DELETE FROM human_knowledge_items WHERE id = ? AND principal_id = ?', [itemId, principalId]);
    return true;
  }

  // ─── Guards ──────────────────────────────────────────────────

  private async _requirePrincipal(principalId: string): Promise<void> {
    const principal = await this.principals.get(principalId);
    if (!principal) throw new HumanPrincipalNotFoundError(`HumanPrincipal not found: ${principalId}`);
  }

  /**
   * Fail-closed metadata validation with default-deny application.
   * Confidence is validated, never defaulted or derived.
   */
  private _checkedMeta(meta: {
    source: unknown;
    provenance?: unknown;
    timeRange?: unknown;
    verificationStatus: unknown;
    confidence: unknown;
    sensitivity?: unknown;
    agentReadable?: unknown;
    primarySubjectRef?: unknown;
    relatedSubjectRefs?: unknown;
  }): HumanKnowledgeMeta {
    if (typeof meta.source !== 'string' || meta.source.length === 0) throw new Error('meta.source is required');
    if (!isHumanVerificationStatus(meta.verificationStatus)) {
      throw new Error(`Invalid verificationStatus: ${String(meta.verificationStatus)}`);
    }
    if (!isValidHumanConfidence(meta.confidence)) {
      throw new Error('meta.confidence must be a finite number in [0, 1] — it is required, never derived');
    }
    const sensitivity: HumanSensitivity =
      meta.sensitivity === undefined ? HUMAN_KNOWLEDGE_DEFAULT_SENSITIVITY : this._checkedSensitivity(meta.sensitivity);
    const agentReadable =
      meta.agentReadable === undefined
        ? HUMAN_KNOWLEDGE_DEFAULT_AGENT_READABLE
        : this._checkedAgentReadable(meta.agentReadable);
    return {
      source: meta.source,
      provenance: this._checkedStringArray(meta.provenance, 'meta.provenance'),
      timeRange: this._checkedTimeRange(meta.timeRange),
      verificationStatus: meta.verificationStatus as HumanVerificationStatus,
      confidence: meta.confidence as number,
      sensitivity,
      agentReadable,
      primarySubjectRef: this._checkedOptionalSubject(meta.primarySubjectRef),
      relatedSubjectRefs: this._checkedStringArray(meta.relatedSubjectRefs, 'meta.relatedSubjectRefs'),
    };
  }

  private _checkedSensitivity(value: unknown): HumanSensitivity {
    if (!isHumanSensitivity(value)) throw new Error(`Invalid sensitivity: ${String(value)}`);
    return value;
  }

  private _checkedAgentReadable(value: unknown): boolean {
    if (typeof value !== 'boolean') throw new Error('meta.agentReadable must be a boolean');
    return value;
  }

  private _checkedStringArray(value: unknown, field: string): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
      throw new Error(`${field} must be a string array`);
    }
    return [...value];
  }

  private _checkedTimeRange(value: unknown): HumanTimeRange | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'object' || value === null) throw new Error('meta.timeRange must be an object');
    const record = value as Record<string, unknown>;
    const range: HumanTimeRange = {};
    if (record.from !== undefined) {
      if (typeof record.from !== 'string') throw new Error('meta.timeRange.from must be a string');
      range.from = record.from;
    }
    if (record.to !== undefined) {
      if (typeof record.to !== 'string') throw new Error('meta.timeRange.to must be a string');
      range.to = record.to;
    }
    if (record.approximate !== undefined) {
      if (typeof record.approximate !== 'boolean') throw new Error('meta.timeRange.approximate must be a boolean');
      range.approximate = record.approximate;
    }
    return range;
  }

  private _checkedOptionalSubject(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string' || value.length === 0)
      throw new Error('primarySubjectRef must be a non-empty string');
    return value;
  }

  // ─── Row mapping (structured round-trip; subjects never promoted) ──

  private _rowToItem<T>(row: Record<string, unknown>): HumanKnowledgeItem<T> {
    const subdomain = row.subdomain as string;
    if (!isHumanKnowledgeSubdomain(subdomain)) {
      throw new Error(`Corrupt subdomain in human knowledge store: ${String(subdomain)}`);
    }
    const verificationStatus = row.verification_status as string;
    if (!isHumanVerificationStatus(verificationStatus)) {
      throw new Error(`Corrupt verificationStatus in human knowledge store: ${String(verificationStatus)}`);
    }
    const sensitivity = row.sensitivity as string;
    if (!isHumanSensitivity(sensitivity)) {
      throw new Error(`Corrupt sensitivity in human knowledge store: ${String(sensitivity)}`);
    }
    const confidence = row.confidence as number;
    if (!isValidHumanConfidence(confidence)) {
      throw new Error('Corrupt confidence in human knowledge store');
    }
    return {
      id: row.id as string,
      principalId: row.principal_id as string,
      subdomain,
      kind: row.kind as string,
      value: JSON.parse(row.value as string) as T,
      meta: {
        source: row.source as string,
        provenance: parseJsonArray(row.provenance),
        timeRange: parseTimeRange(row.time_range),
        verificationStatus,
        confidence,
        sensitivity,
        agentReadable: (row.agent_readable as number) === 1,
        primarySubjectRef:
          row.primary_subject_ref === null || row.primary_subject_ref === undefined
            ? undefined
            : (row.primary_subject_ref as string),
        relatedSubjectRefs: parseJsonArray(row.related_subject_refs),
      },
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
