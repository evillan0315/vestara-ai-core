/**
 * @vestara/context-intelligence — Context Intelligence Core
 *
 * Hybrid retrieval, ranking, budgeting, and minimum sufficient context assembly.
 * Passive data assembly system — does not own conversation, routing, execution, or governance.
 *
 * Architecture Traceability:
 *   CTX-1: Retrieval Foundation
 *   CTX-2: Hybrid Retrieval
 *   CTX-3: Context Assembler
 *   CTX-4: Context Budgets
 *   CTX-5: Ranking
 *   CTX-6: Minimum Sufficient Context
 *   CTX-7: Provenance Tracking
 *   CTX-8: Compression
 *   CTX-9: Change-Aware Retrieval
 *   CTX-10: Historical Incident Retrieval
 *   ENG-0: Developer Preflight
 *   ENG-2: Resource Budgets
 *
 * Invariants:
 *   INV-CTX-1: Context relevance does not confer authority
 *   INV-CTX-2: Context has no cache
 *   INV-CTX-3: Context does not trigger refresh
 */

export { ContextIntelligenceEngine } from './engine';
export type {
  AssembledContext,
  AssembledContextMetadata,
  ChangeAwareQuery,
  ChangeAwareResult,
  ChangeFileContext,
  CompressionSummary,
  ContextAssemblerConfig,
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
  DeveloperPreflightQuery,
  DeveloperPreflightResult,
  HistoricalIncidentQuery,
  HistoricalIncidentResult,
  MinimumSufficientConfig,
  ResourceBudget,
  ResourceUsage,
} from './types';
export {
  DEFAULT_ASSEMBLER_CONFIG,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_MINIMUM_SUFFICIENT,
  DEFAULT_RANKING_CONFIG,
  DEFAULT_RESOURCE_BUDGET,
} from './types';
