/**
 * @vestara/context-intelligence — Context Intelligence Core
 *
 * Hybrid retrieval, ranking, budgeting, and minimum sufficient context assembly.
 * Passive data assembly system — does not own conversation, routing, execution, or governance.
 *
 * Architecture Traceability:
 *   CTX-1: Retrieval Foundation
 *   CTX-2: Hybrid Retrieval
 *   CTX-4: Context Budgets
 *   CTX-5: Ranking
 *   CTX-6: Minimum Sufficient Context
 *   CTX-7: Provenance Tracking
 *   CTX-9: Change-Aware Retrieval
 *
 * Invariants:
 *   INV-CTX-1: Context relevance does not confer authority
 *   INV-CTX-2: Context has no cache
 *   INV-CTX-3: Context does not trigger refresh
 */

export { ContextIntelligenceEngine } from './engine';
export type {
  ContextBudget,
  ContextBudgetClass,
  ContextFreshness,
  ContextProvenance,
  ContextQuery,
  ContextRankingConfig,
  ContextResult,
  ContextRetrievalResult,
  ContextSourceAdapter,
  ContextSourceType,
  ChangeAwareQuery,
  ChangeAwareResult,
  ChangeFileContext,
  MinimumSufficientConfig,
} from './types';
export {
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_MINIMUM_SUFFICIENT,
  DEFAULT_RANKING_CONFIG,
} from './types';
