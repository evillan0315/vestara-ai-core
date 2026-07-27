/**
 * EngineeringMemory — Learns from completed plans, change sets, and verifications.
 *
 * Records patterns from completed work and recalls them when similar
 * goals are proposed. Enables the platform to improve recommendations
 * based on historical outcomes.
 *
 * Architecture Traceability:
 *   Product Principle: Evolve Intelligence Before Autonomy
 */

import type { ChangeSetStorage } from './change-set-storage';
import type { PlanStorage } from './plan-storage';
import type { EngineeringPattern, PatternMatch } from './types';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export class EngineeringMemory {
  private db: any;
  private planStorage?: PlanStorage;
  private csStorage?: ChangeSetStorage;

  constructor(opts: { db: any; planStorage?: PlanStorage; csStorage?: ChangeSetStorage }) {
    this.db = opts.db;
    this.planStorage = opts.planStorage;
    this.csStorage = opts.csStorage;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS engineering_patterns (
        id TEXT PRIMARY KEY,
        goal TEXT,
        keywords TEXT DEFAULT '[]',
        plan_id TEXT,
        change_set_id TEXT,
        verification_id TEXT,
        outcome TEXT,
        health_delta REAL,
        risk_level TEXT,
        effort_level TEXT,
        recorded_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ep_keywords ON engineering_patterns(keywords);
    `);
  }

  /**
   * Record a completed engineering pattern from a plan and its artifacts.
   */
  async record(
    planId: string,
    outcome: 'success' | 'partial' | 'failed',
    healthDelta: number,
  ): Promise<EngineeringPattern> {
    const plan = await this.planStorage?.get(planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    // Extract keywords from the plan goal
    const keywords = plan.goal
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 10);

    // Find linked change sets
    const changeSets = this.csStorage ? await this.csStorage.listByPlan(planId) : [];

    const now = new Date().toISOString();
    const pattern: EngineeringPattern = {
      id: `pat-${Date.now()}`,
      goal: plan.goal,
      keywords,
      planId,
      changeSetId: changeSets[0]?.id ?? null,
      verificationId: null,
      outcome,
      healthDelta,
      riskLevel: plan.risks.length > 3 ? 'high' : plan.risks.length > 0 ? 'medium' : 'low',
      effortLevel: plan.tasks.some((t) => t.effort === 'large')
        ? 'large'
        : plan.tasks.some((t) => t.effort === 'medium')
          ? 'medium'
          : 'small',
      recordedAt: now,
    };

    dbRun(
      this.db,
      `INSERT INTO engineering_patterns
       (id, goal, keywords, plan_id, change_set_id, verification_id, outcome, health_delta, risk_level, effort_level, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pattern.id,
        pattern.goal,
        JSON.stringify(pattern.keywords),
        pattern.planId,
        pattern.changeSetId,
        pattern.verificationId,
        pattern.outcome,
        pattern.healthDelta,
        pattern.riskLevel,
        pattern.effortLevel,
        pattern.recordedAt,
      ],
    );

    return pattern;
  }

  /**
   * Find patterns relevant to a given goal.
   */
  recall(goal: string, limit = 5): PatternMatch[] {
    const terms = goal
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (terms.length === 0) return [];

    const rows = dbAll(this.db, 'SELECT * FROM engineering_patterns ORDER BY recorded_at DESC');
    const matches: PatternMatch[] = [];

    for (const row of rows) {
      const keywords: string[] = JSON.parse(row.keywords ?? '[]');
      const matched = terms.filter((t) => keywords.includes(t)).length;
      const relevance = terms.length > 0 ? matched / terms.length : 0;

      if (relevance > 0) {
        matches.push({
          pattern: {
            id: row.id,
            goal: row.goal,
            keywords,
            planId: row.plan_id,
            changeSetId: row.change_set_id ?? null,
            verificationId: row.verification_id ?? null,
            outcome: row.outcome,
            healthDelta: row.health_delta,
            riskLevel: row.risk_level,
            effortLevel: row.effort_level,
            recordedAt: row.recorded_at,
          },
          relevance: Math.round(relevance * 100) / 100,
        });
      }
    }

    return matches.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  /**
   * Get all recorded patterns.
   */
  listPatterns(): EngineeringPattern[] {
    return dbAll(this.db, 'SELECT * FROM engineering_patterns ORDER BY recorded_at DESC').map((r: any) => ({
      id: r.id,
      goal: r.goal,
      keywords: JSON.parse(r.keywords ?? '[]'),
      planId: r.plan_id,
      changeSetId: r.change_set_id ?? null,
      verificationId: r.verification_id ?? null,
      outcome: r.outcome,
      healthDelta: r.health_delta,
      riskLevel: r.risk_level,
      effortLevel: r.effort_level,
      recordedAt: r.recorded_at,
    }));
  }

  renderPatterns(patterns: EngineeringPattern[]): string {
    if (patterns.length === 0) return 'No patterns recorded yet.';
    const lines: string[] = ['Engineering Memory:'];
    for (const p of patterns) {
      const icon = p.outcome === 'success' ? '✓' : p.outcome === 'partial' ? '∼' : '✗';
      lines.push(`  ${icon} ${p.goal.slice(0, 60)}`);
      lines.push(
        `     ${p.planId} · ${p.effortLevel} effort · risk: ${p.riskLevel} · health: ${p.healthDelta > 0 ? '+' : ''}${p.healthDelta}`,
      );
    }
    return lines.join('\n');
  }

  renderMatches(matches: PatternMatch[]): string {
    if (matches.length === 0) return 'No similar patterns found.';
    const lines: string[] = ['Similar past work:'];
    for (const m of matches) {
      const icon = m.pattern.outcome === 'success' ? '✓' : '∼';
      lines.push(`  ${icon} [${(m.relevance * 100).toFixed(0)}% match] ${m.pattern.goal.slice(0, 60)}`);
      lines.push(`     ${m.pattern.planId} · effort: ${m.pattern.effortLevel} · risk: ${m.pattern.riskLevel}`);
    }
    return lines.join('\n');
  }
}
