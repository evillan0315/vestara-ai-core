/**
 * HUMAN-CONTEXT-003 — governed Human Knowledge substrate.
 *
 * Proves the nine binding invariants plus principal isolation, default-deny,
 * fail-closed validation, structured round-trip, and non-interference with
 * Memory and agent execution paths.
 *
 * Explicitly out of scope: Professional Profile v1 seed, My Story ingestion,
 * HumanContext, retrieval, policy engine, agent integration, prompt rendering,
 * _enrichProfile changes, UserProfile/Memory migration, any UI.
 */

import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HUMAN_KNOWLEDGE_MANIFEST,
  HumanKnowledgeStorage,
  HumanPrincipalNotFoundError,
  HumanPrincipalStorage,
  PLANS_MANIFEST,
} from '../src/index.js';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function setup(): { db: Database; principals: HumanPrincipalStorage; knowledge: HumanKnowledgeStorage } {
  const db = new SQL.Database();
  migrate(db, PLANS_MANIFEST);
  const principals = new HumanPrincipalStorage(db);
  return { db, principals, knowledge: new HumanKnowledgeStorage(db, principals) };
}

async function principal(): Promise<{
  db: Database;
  principals: HumanPrincipalStorage;
  knowledge: HumanKnowledgeStorage;
  id: string;
}> {
  const ctx = setup();
  const created = await ctx.principals.create();
  return { ...ctx, id: created.id };
}

function knowledgeNodeCount(db: Database): number {
  const row = db.exec('SELECT COUNT(*) AS c FROM knowledge_nodes')[0]?.values?.[0]?.[0];
  return Number(row ?? 0);
}

describe('acceptance: three epistemic categories coexist', () => {
  it('A. DOCUMENTED FACT — VERIFIED, document source, 2015 timeRange', async () => {
    const { knowledge, id } = await principal();
    const item = await knowledge.create(id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'Welligent employed Eddie during tax year 2015',
      meta: {
        source: 'w-2',
        provenance: ['doc:w2-2015'],
        timeRange: { from: '2015', to: '2015' },
        verificationStatus: 'VERIFIED',
        confidence: 0.95,
        sensitivity: 'PROFESSIONAL',
        agentReadable: true,
        primarySubjectRef: 'eddie',
      },
    });
    expect(item.meta.verificationStatus).toBe('VERIFIED');
    expect(item.meta.source).toBe('w-2');
    expect(item.meta.timeRange).toEqual({ from: '2015', to: '2015' });
    expect(await knowledge.require(id, item.id)).toEqual(item);
  });

  it('B. APPROXIMATE RECOLLECTION — APPROXIMATE, recollection source', async () => {
    const { knowledge, id } = await principal();
    const item = await knowledge.create(id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'I probably left Centura around 2010',
      meta: {
        source: 'eddie-recollection',
        timeRange: { from: '2010', approximate: true },
        verificationStatus: 'APPROXIMATE',
        confidence: 0.4,
        primarySubjectRef: 'eddie',
      },
    });
    expect(item.meta.verificationStatus).toBe('APPROXIMATE');
    expect(item.meta.timeRange?.approximate).toBe(true);
    // Default-deny: sensitivity/agentReadable omitted → PRIVATE/false.
    expect(item.meta.sensitivity).toBe('PRIVATE');
    expect(item.meta.agentReadable).toBe(false);
  });

  it('C. SUBJECTIVE EXPERIENCE — SUBJECTIVE, recollection source', async () => {
    const { knowledge, id } = await principal();
    const item = await knowledge.create(id, {
      subdomain: 'personal',
      kind: 'lived-experience',
      value: 'I felt like I was the only one carrying the financial pressure',
      meta: {
        source: 'eddie-recollection',
        verificationStatus: 'SUBJECTIVE',
        confidence: 0.9,
        primarySubjectRef: 'eddie',
      },
    });
    expect(item.meta.verificationStatus).toBe('SUBJECTIVE');
    // High confidence-that-stated coexists with non-verified status:
    // confidence describes the assertion/provenance relationship, not truth.
    expect(item.meta.confidence).toBe(0.9);
  });

  it('A/B/C coexist on one principal without normalization', async () => {
    const { knowledge, id } = await principal();
    const a = await knowledge.create(id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'Welligent employed Eddie during tax year 2015',
      meta: { source: 'w-2', verificationStatus: 'VERIFIED', confidence: 0.95 },
    });
    const b = await knowledge.create(id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'I probably left Centura around 2010',
      meta: { source: 'eddie-recollection', verificationStatus: 'APPROXIMATE', confidence: 0.4 },
    });
    const c = await knowledge.create(id, {
      subdomain: 'personal',
      kind: 'lived-experience',
      value: 'I felt like I was the only one carrying the financial pressure',
      meta: { source: 'eddie-recollection', verificationStatus: 'SUBJECTIVE', confidence: 0.9 },
    });
    const listed = await knowledge.list(id);
    expect(listed.map((entry) => entry.meta.verificationStatus).sort()).toEqual([
      'APPROXIMATE',
      'SUBJECTIVE',
      'VERIFIED',
    ]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });
});

describe('round-trip preserves structured metadata', () => {
  it('provenance, subjects, epistemic status, and sensitivity survive storage', async () => {
    const { db, knowledge, id } = await principal();
    const created = await knowledge.create(id, {
      subdomain: 'biography',
      kind: 'relational-event',
      value: { event: 'boss suggested professional help', year: '2009' },
      meta: {
        source: 'eddie-recollection',
        provenance: ['session:reconstruction-004'],
        timeRange: { from: '2009', approximate: true },
        verificationStatus: 'SELF_DESCRIBED',
        confidence: 0.7,
        sensitivity: 'RESTRICTED',
        agentReadable: false,
        primarySubjectRef: 'eddie',
        relatedSubjectRefs: ['former-boss'],
      },
    });
    const bytes = db.export();
    const reopened = new SQL.Database(bytes);
    const restored = new HumanKnowledgeStorage(reopened);
    expect(await restored.require(id, created.id)).toEqual(created);
  });

  it('related subjects never become primary through round-trip', async () => {
    const { knowledge, id } = await principal();
    const created = await knowledge.create(id, {
      subdomain: 'biography',
      kind: 'relational-event',
      value: 'My boss suggested that we seek professional help',
      meta: {
        source: 'eddie-recollection',
        verificationStatus: 'SELF_DESCRIBED',
        confidence: 0.7,
        primarySubjectRef: 'eddie',
        relatedSubjectRefs: ['former-boss'],
      },
    });
    const fetched = await knowledge.require(id, created.id);
    expect(fetched.meta.primarySubjectRef).toBe('eddie');
    expect(fetched.meta.relatedSubjectRefs).toEqual(['former-boss']);
  });
});

describe('default-deny and fail-closed validation', () => {
  it('omitted sensitivity/agentReadable default to PRIVATE/false', async () => {
    const { knowledge, id } = await principal();
    const item = await knowledge.create(id, {
      subdomain: 'goals',
      kind: 'goal',
      value: 'Build Vestara',
      meta: { source: 'eddie-statement', verificationStatus: 'SELF_DESCRIBED', confidence: 0.8 },
    });
    expect(item.meta.sensitivity).toBe('PRIVATE');
    expect(item.meta.agentReadable).toBe(false);
  });

  it('PUBLIC sensitivity and agentReadable=true are storable but grant nothing by themselves', async () => {
    const { knowledge, id } = await principal();
    const item = await knowledge.create(id, {
      subdomain: 'professional',
      kind: 'role-summary',
      value: 'Senior Software & Platform Engineer',
      meta: {
        source: 'eddie-statement',
        verificationStatus: 'SELF_DESCRIBED',
        confidence: 0.85,
        sensitivity: 'PUBLIC',
        agentReadable: true,
      },
    });
    // 003 is storage authority, not publication authority: no projection,
    // retrieval, or policy surface exists to consume these flags.
    expect(item.meta.sensitivity).toBe('PUBLIC');
    expect(item.meta.agentReadable).toBe(true);
    expect(await knowledge.require(id, item.id)).toEqual(item);
  });

  it('invalid verification/sensitivity/subdomain values fail closed', async () => {
    const { knowledge, id } = await principal();
    const base = {
      subdomain: 'career' as const,
      kind: 'employment',
      value: 'x',
      meta: { source: 's', verificationStatus: 'VERIFIED' as const, confidence: 0.5 },
    };
    await expect(
      knowledge.create(id, { ...base, meta: { ...base.meta, verificationStatus: 'PROVEN' as never } }),
    ).rejects.toThrow();
    await expect(
      knowledge.create(id, { ...base, meta: { ...base.meta, sensitivity: 'INTERNAL' as never } }),
    ).rejects.toThrow();
    await expect(knowledge.create(id, { ...base, subdomain: 'memory' as never })).rejects.toThrow();
    await expect(knowledge.create(id, { ...base, meta: { ...base.meta, confidence: 1.5 } })).rejects.toThrow();
    await expect(knowledge.create(id, { ...base, meta: { ...base.meta, confidence: Number.NaN } })).rejects.toThrow();
    await expect(knowledge.create(id, { ...base, meta: { ...base.meta, source: '' } })).rejects.toThrow();
    await expect(knowledge.list(id, { subdomain: 'scope' as never })).rejects.toThrow();
  });
});

describe('principal isolation', () => {
  it('knowledge for A is invisible through B (get/require/list/update/delete)', async () => {
    const ctx = setup();
    const a = await ctx.principals.create();
    const b = await ctx.principals.create();
    const item = await ctx.knowledge.create(a.id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'Welligent employed Eddie during tax year 2015',
      meta: { source: 'w-2', verificationStatus: 'VERIFIED', confidence: 0.95 },
    });
    expect(await ctx.knowledge.get(b.id, item.id)).toBeNull();
    await expect(ctx.knowledge.require(b.id, item.id)).rejects.toThrow('not found');
    expect(await ctx.knowledge.list(b.id)).toEqual([]);
    await expect(ctx.knowledge.update(b.id, item.id, { kind: 'other' })).rejects.toThrow('not found');
    expect(await ctx.knowledge.delete(b.id, item.id)).toBe(false);
    // Owner path unaffected.
    expect(await ctx.knowledge.require(a.id, item.id)).toEqual(item);
  });

  it('update/delete require both item identity and owning principal', async () => {
    const { knowledge, id } = await principal();
    const item = await knowledge.create(id, {
      subdomain: 'skills',
      kind: 'skill',
      value: 'TypeScript',
      meta: { source: 'eddie-statement', verificationStatus: 'SELF_DESCRIBED', confidence: 0.8 },
    });
    const updated = await knowledge.update(id, item.id, {
      value: 'TypeScript/Node',
      meta: { confidence: 0.85, sensitivity: 'PROFESSIONAL' as const },
    });
    expect(updated.value).toBe('TypeScript/Node');
    expect(updated.meta.confidence).toBe(0.85);
    expect(updated.meta.sensitivity).toBe('PROFESSIONAL');
    expect(updated.meta.verificationStatus).toBe('SELF_DESCRIBED');
    expect(updated.subdomain).toBe('skills');
    expect(await knowledge.delete(id, item.id)).toBe(true);
    expect(await knowledge.get(id, item.id)).toBeNull();
    expect(await knowledge.delete(id, item.id)).toBe(false);
  });

  it('unknown principal references fail deterministically', async () => {
    const { knowledge } = setup();
    await expect(
      knowledge.create('hp-ghost', {
        subdomain: 'career',
        kind: 'employment',
        value: 'x',
        meta: { source: 's', verificationStatus: 'VERIFIED', confidence: 0.5 },
      }),
    ).rejects.toBeInstanceOf(HumanPrincipalNotFoundError);
    await expect(knowledge.get('hp-ghost', 'hk-ghost')).rejects.toBeInstanceOf(HumanPrincipalNotFoundError);
    await expect(knowledge.list('hp-ghost')).rejects.toBeInstanceOf(HumanPrincipalNotFoundError);
  });
});

describe('non-interference: Memory and agent paths untouched', () => {
  it('storing knowledge writes no Memory/EngineeringMemory rows', async () => {
    const { db, knowledge, id } = await principal();
    const before = knowledgeNodeCount(db);
    await knowledge.create(id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'Welligent employed Eddie during tax year 2015',
      meta: { source: 'w-2', verificationStatus: 'VERIFIED', confidence: 0.95 },
    });
    await knowledge.create(id, {
      subdomain: 'personal',
      kind: 'lived-experience',
      value: 'I felt like I was the only one carrying the financial pressure',
      meta: { source: 'eddie-recollection', verificationStatus: 'SUBJECTIVE', confidence: 0.9 },
    });
    expect(knowledgeNodeCount(db)).toBe(before);
    // The engineering-patterns table is lazily created by EngineeringMemory,
    // never by this store: knowledge writes must not materialize it.
    const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values ?? []).map((row) =>
      String(row[0]),
    );
    expect(tables).not.toContain('engineering_patterns');
  });

  it('knowledge storage carries no prompt/execution/memory surface', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../src/human-knowledge-storage.ts', import.meta.url), 'utf-8');
    for (const forbidden of [
      'MemoryService',
      'EngineeringMemory',
      'KnowledgeGraphStorage',
      'systemPrompt',
      'buildContext',
      'AgentExecutionRequest',
      'instruction',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe('append-only migration upgrade', () => {
  it('upgrades a pre-human-knowledge database, applying only the new step', async () => {
    expect(HUMAN_KNOWLEDGE_MANIFEST.steps.map((s) => s.name)).toEqual(['human_knowledge.baseline']);
    const names = PLANS_MANIFEST.steps.map((s) => s.name);
    expect(names[names.length - 1]).toBe('human_knowledge.baseline');

    const { buildManifest } = await import('@vestara/sqlite-migrations');
    const legacy = buildManifest('plans-pre-human-knowledge', [PLANS_MANIFEST.steps.slice(0, -1)]);
    const db = new SQL.Database();
    const installed = migrate(db, legacy);
    expect(installed.to).toBe(PLANS_MANIFEST.steps.length - 1);

    const result = migrate(db, PLANS_MANIFEST);
    expect(result.applied).toEqual(['human_knowledge.baseline']);

    const principals = new HumanPrincipalStorage(db);
    const knowledge = new HumanKnowledgeStorage(db, principals);
    const owner = await principals.create();
    const item = await knowledge.create(owner.id, {
      subdomain: 'career',
      kind: 'employment',
      value: 'Welligent employed Eddie during tax year 2015',
      meta: { source: 'w-2', verificationStatus: 'VERIFIED', confidence: 0.95 },
    });
    expect(await knowledge.require(owner.id, item.id)).toEqual(item);
  });
});
