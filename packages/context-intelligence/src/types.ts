/**
 * VESTARA-INTELLIGENCE M-B4: Context Intelligence Core Types
 *
 * Defines the core types for Context Intelligence — the hybrid retrieval,
 * ranking, budgeting, and minimum sufficient context assembly system.
 *
 * Ownership:
 * - Context Intelligence is a passive data assembly system
 * - It does NOT own conversation state, routing, execution, or governance
 * - It retrieves, ranks, and budgets context from existing sources
 *
 * Invariants:
 * - INV-CTX-1: Context relevance does not confer routing/execution/mutation/authorization authority
 * - INV-CTX-2: Context has no cache — it is real-time data
 * - INV-CTX-3: Context does not trigger context refresh — it is passive
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { JsonRecord } from '@vestara/types';

// ─── CTX-1: Retrieval Foundation ───────────────────────────────

/**
 * CTX-1: Query for context retrieval.
 * Defines what context is needed and optional constraints.
 */
export interface ContextQuery {
  /** The query text or intent */
  readonly query: string;

  /** Optional: source types to retrieve from (empty = all sources) */
  readonly sourceTypes?: readonly ContextSourceType[];

  /** Optional: maximum number of results per source */
  readonly maxResults?: number;

  /** Optional: token budget for the entire query */
  readonly tokenBudget?: number;

  /** Optional: freshness constraint — only return evidence newer than this */
  readonly newerThan?: string;

  /** Optional: query metadata for provenance tracking */
  readonly metadata?: JsonRecord;
}

/**
 * CTX-1: Source types for context retrieval.
 */
export type ContextSourceType =
  | 'engineering-graph'   // Entity/relationship data from the Engineering Graph
  | 'evidence'            // Evidence references from PCS-026
  | 'diagnostics'         // Diagnostic snapshots from DIAG-1
  | 'observer'            // Observer findings from OBS-1
  | 'temporal'            // Temporal evidence from OBS-2
  | 'documentation';      // Project documentation

/**
 * CTX-1: A single context retrieval result.
 */
export interface ContextResult {
  /** Unique identifier for this result */
  readonly id: string;

  /** The source type that produced this result */
  readonly sourceType: ContextSourceType;

  /** The source ID (e.g., entity ID, bundle ID, finding ID) */
  readonly sourceId: string;

  /** Human-readable title */
  readonly title: string;

  /** The context content (may be truncated to fit budget) */
  readonly content: string;

  /** Relevance score (0-1) — higher = more relevant */
  readonly relevanceScore: number;

  /** Confidence score (0-1) — higher = more certain */
  readonly confidenceScore: number;

  /** Freshness indicator */
  readonly freshness: ContextFreshness;

  /** Budget class — how much token budget this result consumes */
  readonly budgetClass: ContextBudgetClass;

  /** Optional: structured metadata */
  readonly metadata?: JsonRecord;

  /** Optional: references to related results */
  readonly relatedIds?: readonly string[];
}

/**
 * CTX-1: Result of a context retrieval query.
 */
export interface ContextRetrievalResult {
  /** All results from the query */
  readonly results: readonly ContextResult[];

  /** Total number of results (before budget truncation) */
  readonly totalResults: number;

  /** Total token count of all results */
  readonly totalTokens: number;

  /** Token budget remaining after truncation */
  readonly budgetRemaining: number;

  /** Query execution duration in milliseconds */
  readonly durationMs: number;

  /** Sources that were queried */
  readonly sourcesQueried: readonly ContextSourceType[];

  /** Sources that returned results */
  readonly sourcesHit: readonly ContextSourceType[];
}

// ─── CTX-1: Source Adapter Interface ───────────────────────────

/**
 * CTX-1: Interface for source adapters that provide context.
 * Each source type has an adapter that knows how to query its data.
 */
export interface ContextSourceAdapter {
  /** The source type this adapter handles */
  readonly sourceType: ContextSourceType;

  /**
   * Retrieve context results for a query.
   * @param query - The context query
   * @returns Array of context results from this source
   */
  retrieve(query: ContextQuery): Promise<readonly ContextResult[]>;
}

// ─── CTX-4: Context Budgets ────────────────────────────────────

/**
 * CTX-4: Budget class for context results.
 * Determines how much token budget a result consumes.
 */
export type ContextBudgetClass =
  | 'minimal'    // < 100 tokens (e.g., status flag, simple fact)
  | 'compact'    // 100-500 tokens (e.g., summary, diff excerpt)
  | 'standard'   // 500-2000 tokens (e.g., test output, code snippet)
  | 'verbose';   // > 2000 tokens (e.g., full file, detailed report)

/**
 * CTX-4: Token budget allocation for a context query.
 */
export interface ContextBudget {
  /** Total token budget for the query */
  readonly totalTokens: number;

  /** Token allocation per budget class */
  readonly allocations: Record<ContextBudgetClass, number>;

  /** Maximum number of results per source */
  readonly maxPerSource: number;

  /** Maximum number of results total */
  readonly maxTotal: number;
}

/**
 * CTX-4: Default budget allocation.
 */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  totalTokens: 8000,
  allocations: {
    minimal: 500,
    compact: 1500,
    standard: 4000,
    verbose: 2000,
  },
  maxPerSource: 10,
  maxTotal: 50,
};

// ─── CTX-5: Ranking ────────────────────────────────────────────

/**
 * CTX-5: Ranking configuration for context results.
 */
export interface ContextRankingConfig {
  /** Weight for relevance score (0-1) */
  readonly relevanceWeight: number;

  /** Weight for confidence score (0-1) */
  readonly confidenceWeight: number;

  /** Weight for freshness (0-1) */
  readonly freshnessWeight: number;

  /** Weight for source diversity (0-1) */
  readonly diversityWeight: number;
}

/**
 * CTX-5: Default ranking configuration.
 */
export const DEFAULT_RANKING_CONFIG: ContextRankingConfig = {
  relevanceWeight: 0.4,
  confidenceWeight: 0.3,
  freshnessWeight: 0.2,
  diversityWeight: 0.1,
};

// ─── CTX-6: Minimum Sufficient Context ─────────────────────────

/**
 * CTX-6: Configuration for minimum sufficient context assembly.
 */
export interface MinimumSufficientConfig {
  /** Minimum relevance score threshold (0-1) */
  readonly minRelevance: number;

  /** Minimum confidence score threshold (0-1) */
  readonly minConfidence: number;

  /** Stop retrieval when this many results are gathered */
  readonly stopAfterResults: number;

  /** Stop retrieval when this percentage of budget is used */
  readonly stopAfterBudgetPercent: number;
}

/**
 * CTX-6: Default minimum sufficient configuration.
 */
export const DEFAULT_MINIMUM_SUFFICIENT: MinimumSufficientConfig = {
  minRelevance: 0.3,
  minConfidence: 0.3,
  stopAfterResults: 20,
  stopAfterBudgetPercent: 0.9,
};

// ─── CTX-7: Provenance Tracking ────────────────────────────────

/**
 * CTX-7: Provenance metadata for context results.
 * Tracks which source produced each result and when.
 */
export interface ContextProvenance {
  /** Source type that produced this result */
  readonly sourceType: ContextSourceType;

  /** Source ID (e.g., entity ID, bundle ID) */
  readonly sourceId: string;

  /** ISO-8601 timestamp when this result was retrieved */
  readonly retrievedAt: string;

  /** ISO-8601 timestamp when the source data was last updated */
  readonly sourceUpdatedAt: string;

  /** Query that produced this result */
  readonly query: string;

  /** Optional: rank position in the result set */
  readonly rank?: number;
}

// ─── Freshness ─────────────────────────────────────────────────

/**
 * CTX-1/CTX-0: Freshness indicator for context results.
 */
export type ContextFreshness =
  | 'stale'      // > 24 hours old
  | 'recent'     // 1-24 hours old
  | 'fresh'      // < 1 hour old
  | 'current';   // < 5 minutes old

// ─── CTX-9: Change-Aware Retrieval ─────────────────────────────

/**
 * CTX-9: Query for change-aware retrieval.
 * Given a diff or commit, retrieve context about what changed.
 */
export interface ChangeAwareQuery {
  /** The git diff or commit hash */
  readonly changeRef: string;

  /** Changed files in this change */
  readonly changedFiles: readonly string[];

  /** Optional: commit message for additional context */
  readonly commitMessage?: string;

  /** Optional: query text for semantic retrieval */
  readonly query?: string;
}

/**
 * CTX-9: Result of a change-aware retrieval.
 */
export interface ChangeAwareResult {
  /** Changed files with their context */
  readonly files: readonly ChangeFileContext[];

  /** Overall relevance score for this change */
  readonly relevanceScore: number;

  /** Summary of the change context */
  readonly summary: string;
}

/**
 * CTX-9: Context for a single changed file.
 */
export interface ChangeFileContext {
  /** File path */
  readonly path: string;

  /** Change type (added, modified, deleted, renamed) */
  readonly changeType: 'added' | 'modified' | 'deleted' | 'renamed';

  /** Related context results for this file */
  readonly context: readonly ContextResult[];
}

// ─── CTX-3: Context Assembler ──────────────────────────────────

/**
 * CTX-3: Configuration for the Context Assembler.
 * Determines the order and priority of source retrieval.
 */
export interface ContextAssemblerConfig {
  /** Order of source retrieval (first = highest priority) */
  readonly sourcePriority: readonly ContextSourceType[];

  /** Maximum time to wait for a single source (ms) */
  readonly sourceTimeoutMs: number;

  /** Whether to continue if a source fails */
  readonly continueOnSourceFailure: boolean;

  /** Maximum total retrieval time (ms) */
  readonly maxTotalTimeMs: number;
}

/**
 * CTX-3: Default assembler configuration.
 */
export const DEFAULT_ASSEMBLER_CONFIG: ContextAssemblerConfig = {
  sourcePriority: ['engineering-graph', 'evidence', 'diagnostics', 'observer', 'temporal', 'documentation'],
  sourceTimeoutMs: 5000,
  continueOnSourceFailure: true,
  maxTotalTimeMs: 30000,
};

/**
 * CTX-3: Assembled context package — the output of the Context Assembler.
 */
export interface AssembledContext {
  /** The assembled context results */
  readonly results: readonly ContextResult[];

  /** Assembly metadata */
  readonly metadata: AssembledContextMetadata;

  /** Compression summary (if compression was applied) */
  readonly compression?: CompressionSummary;

  /** Provenance for all results */
  readonly provenance: readonly ContextProvenance[];
}

/**
 * CTX-3: Metadata about the assembly process.
 */
export interface AssembledContextMetadata {
  /** ISO-8601 timestamp of assembly */
  readonly assembledAt: string;

  /** Sources that were queried */
  readonly sourcesQueried: readonly ContextSourceType[];

  /** Sources that returned results */
  readonly sourcesHit: readonly ContextSourceType[];

  /** Total results before budget truncation */
  readonly totalResultsBeforeTruncation: number;

  /** Total results after budget truncation */
  readonly totalResultsAfterTruncation: number;

  /** Assembly duration in milliseconds */
  readonly durationMs: number;

  /** Token budget used */
  readonly tokensUsed: number;

  /** Token budget remaining */
  readonly tokensRemaining: number;
}

// ─── CTX-8: Compression ────────────────────────────────────────

/**
 * CTX-8: Compression summary — describes how context was compressed.
 * Summaries reference original evidence bundles; they do not replace them.
 */
export interface CompressionSummary {
  /** Number of results before compression */
  readonly beforeCount: number;

  /** Number of results after compression */
  readonly afterCount: number;

  /** Token count before compression */
  readonly beforeTokens: number;

  /** Token count after compression */
  readonly afterTokens: number;

  /** Compression ratio (after/before) */
  readonly ratio: number;

  /** Whether compression was lossy */
  readonly lossy: boolean;

  /** References to original evidence bundles (INV-EVD-1: never replaced) */
  readonly evidenceBundleRefs: readonly string[];
}

// ─── CTX-10: Historical Incident Retrieval ─────────────────────

/**
 * CTX-10: Query for historical incident retrieval.
 * Query diagnostic incident timeline for historical incidents.
 */
export interface HistoricalIncidentQuery {
  /** Optional: time range to search */
  readonly timeRange?: { start: string; end: string };

  /** Optional: source IDs to filter by */
  readonly sourceIds?: readonly string[];

  /** Optional: minimum severity */
  readonly minSeverity?: string;

  /** Optional: incident status filter */
  readonly status?: string;

  /** Optional: maximum results */
  readonly limit?: number;
}

/**
 * CTX-10: Historical incident result.
 */
export interface HistoricalIncidentResult {
  /** Incident ID */
  readonly id: string;

  /** Incident title */
  readonly title: string;

  /** Incident status */
  readonly status: string;

  /** Severity */
  readonly severity: string;

  /** Confidence level */
  readonly confidence: number;

  /** ISO-8601 detection time */
  readonly detectedAt: string;

  /** Source IDs involved */
  readonly sourceIds: readonly string[];

  /** Related context results */
  readonly relatedContext: readonly ContextResult[];
}

// ─── ENG-0: Developer Preflight ────────────────────────────────

/**
 * ENG-0: Developer preflight query.
 * Assemble context before agent execution.
 */
export interface DeveloperPreflightQuery {
  /** The task or goal to execute */
  readonly task: string;

  /** Changed files (if applicable) */
  readonly changedFiles?: readonly string[];

  /** Optional: workspace path */
  readonly workspacePath?: string;

  /** Optional: previous context from prior turns */
  readonly previousContext?: readonly ContextResult[];

  /** Optional: resource budget for the investigation */
  readonly budget?: ResourceBudget;
}

/**
 * ENG-0: Developer preflight result.
 * Context package assembled before execution.
 */
export interface DeveloperPreflightResult {
  /** Assembled context for the task */
  readonly context: AssembledContext;

  /** Relevant code files */
  readonly codeFiles: readonly ContextResult[];

  /** Relevant evidence */
  readonly evidence: readonly ContextResult[];

  /** Relevant incidents */
  readonly incidents: readonly HistoricalIncidentResult[];

  /** Relevant graph relationships */
  readonly graphContext: readonly ContextResult[];

  /** Preflight metadata */
  readonly metadata: {
    readonly assembledAt: string;
    readonly durationMs: number;
    readonly totalTokens: number;
    readonly budgetUsed: number;
  };
}

// ─── ENG-2: Resource Budgets ───────────────────────────────────

/**
 * ENG-2: Investigation-specific resource budget.
 * Limits time, tokens, and tool calls for adaptive investigation.
 */
export interface ResourceBudget {
  /** Maximum time in milliseconds */
  readonly maxTimeMs: number;

  /** Maximum total tokens */
  readonly maxTokens: number;

  /** Maximum number of tool calls */
  readonly maxToolCalls: number;

  /** Maximum number of retrieval queries */
  readonly maxQueries: number;

  /** Alert threshold (percentage of budget) — triggers warning when exceeded */
  readonly alertThresholdPercent: number;
}

/**
 * ENG-2: Default resource budget.
 */
export const DEFAULT_RESOURCE_BUDGET: ResourceBudget = {
  maxTimeMs: 300_000, // 5 minutes
  maxTokens: 50_000,
  maxToolCalls: 100,
  maxQueries: 20,
  alertThresholdPercent: 0.8,
};

/**
 * ENG-2: Current resource usage during an investigation.
 */
export interface ResourceUsage {
  /** Time elapsed in milliseconds */
  readonly elapsedMs: number;

  /** Tokens consumed */
  readonly tokensUsed: number;

  /** Tool calls made */
  readonly toolCallsUsed: number;

  /** Queries executed */
  readonly queriesUsed: number;

  /** Whether any budget limit has been exceeded */
  readonly exceeded: boolean;

  /** Whether alert threshold has been reached */
  readonly alertTriggered: boolean;
}
