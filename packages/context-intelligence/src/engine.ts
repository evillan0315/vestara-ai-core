/**
 * VESTARA-INTELLIGENCE CTX-1/2/4/5/6/7: Context Intelligence Engine
 *
 * Core retrieval engine that orchestrates hybrid retrieval, ranking,
 * budgeting, and minimum sufficient context assembly.
 *
 * Invariants:
 * - INV-CTX-1: Context relevance does not confer authority
 * - INV-CTX-2: Context has no cache
 * - INV-CTX-3: Context does not trigger refresh
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type {
  ContextBudget,
  ContextProvenance,
  ContextQuery,
  ContextRankingConfig,
  ContextResult,
  ContextRetrievalResult,
  ContextSourceAdapter,
  ContextSourceType,
  MinimumSufficientConfig,
} from './types';
import { DEFAULT_CONTEXT_BUDGET, DEFAULT_MINIMUM_SUFFICIENT, DEFAULT_RANKING_CONFIG } from './types';

/**
 * CTX-1/2/4/5/6: Context Intelligence Engine
 *
 * Orchestrates the full context retrieval pipeline:
 * 1. Query all registered source adapters (CTX-1/2)
 * 2. Rank results by relevance, confidence, freshness, diversity (CTX-5)
 * 3. Apply budget constraints (CTX-4)
 * 4. Assemble minimum sufficient context (CTX-6)
 * 5. Track provenance for all results (CTX-7)
 */
export class ContextIntelligenceEngine {
  private adapters: Map<ContextSourceType, ContextSourceAdapter> = new Map();
  private rankingConfig: ContextRankingConfig;
  private budget: ContextBudget;
  private minimumSufficient: MinimumSufficientConfig;

  constructor(config?: {
    ranking?: Partial<ContextRankingConfig>;
    budget?: Partial<ContextBudget>;
    minimumSufficient?: Partial<MinimumSufficientConfig>;
  }) {
    this.rankingConfig = { ...DEFAULT_RANKING_CONFIG, ...config?.ranking };
    this.budget = { ...DEFAULT_CONTEXT_BUDGET, ...config?.budget };
    this.minimumSufficient = { ...DEFAULT_MINIMUM_SUFFICIENT, ...config?.minimumSufficient };
  }

  /**
   * CTX-1: Register a source adapter for a specific source type.
   */
  registerSource(adapter: ContextSourceAdapter): void {
    this.adapters.set(adapter.sourceType, adapter);
  }

  /**
   * CTX-1: Unregister a source adapter.
   */
  unregisterSource(sourceType: ContextSourceType): void {
    this.adapters.delete(sourceType);
  }

  /**
   * CTX-1/2/4/5/6: Main retrieval pipeline.
   * Orchestrates hybrid retrieval, ranking, budgeting, and assembly.
   */
  async retrieveContext(query: ContextQuery): Promise<ContextRetrievalResult> {
    const start = Date.now();
    const sourcesQueried: ContextSourceType[] = [];
    const sourcesHit: ContextSourceType[] = [];
    const allResults: ContextResult[] = [];

    // CTX-2: Hybrid retrieval — query all registered adapters
    const adaptersToQuery = query.sourceTypes?.length
      ? query.sourceTypes.filter((st) => this.adapters.has(st))
      : Array.from(this.adapters.keys());

    for (const sourceType of adaptersToQuery) {
      const adapter = this.adapters.get(sourceType);
      if (!adapter) continue;

      sourcesQueried.push(sourceType);

      try {
        const results = await adapter.retrieve(query);
        if (results.length > 0) {
          sourcesHit.push(sourceType);
          allResults.push(...results);
        }
      } catch (err) {
        // Graceful degradation: source errors don't stop other sources
        console.warn(`Context source ${sourceType} failed:`, err);
      }
    }

    // CTX-5: Rank results
    const ranked = this.rankResults(allResults);

    // CTX-4/6: Apply budget constraints and assemble minimum sufficient context
    const assembled = this.applyBudgetAndAssemble(ranked, query.tokenBudget ?? this.budget.totalTokens);

    const durationMs = Date.now() - start;

    return {
      results: assembled,
      totalResults: allResults.length,
      totalTokens: this.estimateTokens(assembled),
      budgetRemaining: (query.tokenBudget ?? this.budget.totalTokens) - this.estimateTokens(assembled),
      durationMs,
      sourcesQueried,
      sourcesHit,
    };
  }

  /**
   * CTX-5: Rank results by relevance, confidence, freshness, and diversity.
   */
  private rankResults(results: readonly ContextResult[]): readonly ContextResult[] {
    const scored = results.map((r) => {
      const freshnessScore = this.freshnessToScore(r.freshness);
      const score =
        r.relevanceScore * this.rankingConfig.relevanceWeight +
        r.confidenceScore * this.rankingConfig.confidenceWeight +
        freshnessScore * this.rankingConfig.freshnessWeight;

      return { result: r, score };
    });

    // Sort by composite score (descending)
    scored.sort((a, b) => b.score - a.score);

    // CTX-5: Apply diversity — ensure mix of source types
    if (this.rankingConfig.diversityWeight > 0) {
      return this.applyDiversity(scored.map((s) => s.result));
    }

    return scored.map((s) => s.result);
  }

  /**
   * CTX-5: Apply source diversity to ensure a mix of source types.
   */
  private applyDiversity(results: readonly ContextResult[]): readonly ContextResult[] {
    const bySource = new Map<ContextSourceType, ContextResult[]>();
    for (const r of results) {
      const list = bySource.get(r.sourceType) ?? [];
      list.push(r);
      bySource.set(r.sourceType, list);
    }

    // Round-robin from each source type
    const diversified: ContextResult[] = [];
    const maxPerSource = this.budget.maxPerSource;
    let added = true;

    while (added) {
      added = false;
      for (const [, list] of bySource) {
        if (list.length > 0 && diversified.length < this.budget.maxTotal) {
          diversified.push(list.shift()!);
          added = true;
        }
      }
    }

    return diversified;
  }

  /**
   * CTX-4/6: Apply budget constraints and assemble minimum sufficient context.
   */
  private applyBudgetAndAssemble(
    results: readonly ContextResult[],
    totalBudget: number,
  ): readonly ContextResult[] {
    const assembled: ContextResult[] = [];
    let tokensUsed = 0;
    const budgetByClass = { ...this.budget.allocations };

    for (const result of results) {
      // Check total budget
      if (tokensUsed >= totalBudget) break;

      // Check per-class budget
      const classTokens = budgetByClass[result.budgetClass];
      if (classTokens <= 0) continue;

      // Estimate result tokens
      const resultTokens = this.estimateResultTokens(result);

      // Check if result fits in budget
      if (tokensUsed + resultTokens > totalBudget) continue;
      if (resultTokens > classTokens) continue;

      // Check minimum thresholds
      if (result.relevanceScore < this.minimumSufficient.minRelevance) continue;
      if (result.confidenceScore < this.minimumSufficient.minConfidence) continue;

      assembled.push(result);
      tokensUsed += resultTokens;
      budgetByClass[result.budgetClass] -= resultTokens;

      // Check stop conditions
      if (assembled.length >= this.minimumSufficient.stopAfterResults) break;
      if (tokensUsed >= totalBudget * this.minimumSufficient.stopAfterBudgetPercent) break;
    }

    return assembled;
  }

  /**
   * CTX-7: Create provenance metadata for a context result.
   */
  createProvenance(
    result: ContextResult,
    query: string,
    rank: number,
  ): ContextProvenance {
    return {
      sourceType: result.sourceType,
      sourceId: result.sourceId,
      retrievedAt: new Date().toISOString(),
      sourceUpdatedAt: new Date().toISOString(),
      query,
      rank,
    };
  }

  private freshnessToScore(freshness: string): number {
    switch (freshness) {
      case 'current': return 1.0;
      case 'fresh': return 0.8;
      case 'recent': return 0.5;
      case 'stale':
      default: return 0.2;
    }
  }

  private estimateResultTokens(result: ContextResult): number {
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(result.content.length / 4);
  }

  private estimateTokens(results: readonly ContextResult[]): number {
    return results.reduce((sum, r) => sum + this.estimateResultTokens(r), 0);
  }
}
