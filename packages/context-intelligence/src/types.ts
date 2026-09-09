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

// ─── ENG-1: Adaptive Investigation ─────────────────────────────

/**
 * ENG-1: Investigation record — agent-directed evidence gathering.
 * The agent reads Context Intelligence output, Observer findings,
 * and Diagnostics facts to produce investigation records.
 */
export interface Investigation {
  /** Unique investigation identifier */
  readonly id: string;

  /** The task or question being investigated */
  readonly task: string;

  /** Current status of the investigation */
  readonly status: InvestigationStatus;

  /** Evidence gathered during the investigation */
  readonly evidence: readonly InvestigationEvidence[];

  /** Findings produced during the investigation */
  readonly findings: readonly InvestigationFinding[];

  /** Resource usage so far */
  readonly resourceUsage: ResourceUsage;

  /** ISO-8601 timestamp when investigation started */
  readonly startedAt: string;

  /** ISO-8601 timestamp of last activity */
  readonly lastActivityAt: string;

  /** Optional: parent investigation ID (for sub-investigations) */
  readonly parentInvestigationId?: string;

  /** Optional: related incident IDs */
  readonly relatedIncidentIds?: readonly string[];
}

/**
 * ENG-1: Investigation status.
 */
export type InvestigationStatus =
  | 'active'      // Currently gathering evidence
  | 'paused'      // Paused (budget limit, user request)
  | 'completed'   // Investigation finished
  | 'failed'      // Investigation failed
  | 'abandoned';  // Investigation abandoned

/**
 * ENG-1: Evidence gathered during an investigation.
 */
export interface InvestigationEvidence {
  /** Unique evidence identifier */
  readonly id: string;

  /** Source type that produced this evidence */
  readonly sourceType: ContextSourceType;

  /** Source ID (e.g., entity ID, bundle ID, finding ID) */
  readonly sourceId: string;

  /** Brief description of what this evidence shows */
  readonly summary: string;

  /** Relevance score (0-1) */
  readonly relevanceScore: number;

  /** ISO-8601 timestamp when this evidence was gathered */
  readonly gatheredAt: string;

  /** Optional: full context result */
  readonly contextResult?: ContextResult;
}

/**
 * ENG-1: Finding produced during an investigation.
 */
export interface InvestigationFinding {
  /** Unique finding identifier */
  readonly id: string;

  /** Finding title */
  readonly title: string;

  /** Detailed description */
  readonly description: string;

  /** Confidence score (0-1) */
  readonly confidence: number;

  /** Evidence IDs that support this finding */
  readonly evidenceIds: readonly string[];

  /** ISO-8601 timestamp when this finding was produced */
  readonly discoveredAt: string;
}

// ─── ENG-3: Governed Escalation ────────────────────────────────

/**
 * ENG-3: Escalation request — agent-initiated request for broader authority.
 * Uses the existing Approval system (Workflow Authority).
 * Escalation is a request, not a grant.
 */
export interface EscalationRequest {
  /** Unique escalation identifier */
  readonly id: string;

  /** The authority being requested */
  readonly requestedAuthority: EscalationAuthority;

  /** Reason for the escalation request */
  readonly reason: string;

  /** Current status of the escalation */
  readonly status: EscalationStatus;

  /** The investigation that triggered this escalation */
  readonly investigationId: string;

  /** ISO-8601 timestamp when escalation was requested */
  readonly requestedAt: string;

  /** ISO-8601 timestamp when escalation was resolved */
  readonly resolvedAt?: string;

  /** Decision reason (if resolved) */
  readonly decisionReason?: string;

  /** Who made the decision */
  readonly decidedBy?: string;
}

/**
 * ENG-3: Authority types that can be escalated.
 */
export type EscalationAuthority =
  | 'file-write'       // Write access to specific files
  | 'file-delete'      // Delete access to specific files
  | 'command-execute'  // Execute specific commands
  | 'network-access'   // Access specific network resources
  | 'provider-access'  // Access specific AI providers
  | 'governance-write'; // Write to governance authority

/**
 * ENG-3: Escalation status.
 */
export type EscalationStatus =
  | 'pending'    // Waiting for approval
  | 'approved'   // Approved by authority
  | 'denied'     // Denied by authority
  | 'expired'    // Escalation request expired
  | 'revoked';   // Previously approved, now revoked

// ─── ENG-4: Correction Proposal ────────────────────────────────

/**
 * ENG-4: Correction proposal — propose corrections to Workflow/Governance authority.
 * Produces correction proposals, not direct mutations.
 * All mutations continue through existing Workflow/Governance authority.
 */
export interface CorrectionProposal {
  /** Unique proposal identifier */
  readonly id: string;

  /** The target of the correction (file, workflow, governance rule) */
  readonly target: CorrectionTarget;

  /** The proposed change */
  readonly proposedChange: CorrectionChange;

  /** Evidence supporting this proposal */
  readonly evidence: readonly string[];

  /** Confidence score (0-1) */
  readonly confidence: number;

  /** Current status of the proposal */
  readonly status: CorrectionProposalStatus;

  /** ISO-8601 timestamp when proposal was created */
  readonly createdAt: string;

  /** ISO-8601 timestamp of last update */
  readonly updatedAt: string;

  /** Optional: investigation ID that produced this proposal */
  readonly investigationId?: string;
}

/**
 * ENG-4: Target of a correction proposal.
 */
export interface CorrectionTarget {
  /** Type of target */
  readonly type: 'file' | 'workflow' | 'governance' | 'configuration';

  /** Target identifier (e.g., file path, workflow ID) */
  readonly id: string;

  /** Current state of the target */
  readonly currentState: string;

  /** Optional: version or hash of the current state */
  readonly currentVersion?: string;
}

/**
 * ENG-4: Proposed change.
 */
export interface CorrectionChange {
  /** Type of change */
  readonly type: 'modify' | 'create' | 'delete' | 'restore';

  /** New state or content (for modify/create) */
  readonly newState?: string;

  /** Previous state to restore (for restore) */
  readonly restoreFrom?: string;

  /** Description of what this change accomplishes */
  readonly description: string;
}

/**
 * ENG-4: Correction proposal status.
 */
export type CorrectionProposalStatus =
  | 'proposed'    // Proposal created, awaiting review
  | 'approved'    // Approved for execution
  | 'rejected'    // Rejected by authority
  | 'executing'   // Being executed
  | 'completed'   // Execution completed
  | 'failed'      // Execution failed
  | 'rolled-back'; // Execution rolled back

// ─── ENG-5: Verification Extension ─────────────────────────────

/**
 * ENG-5: Verification run — agent-directed verification that consumes
 * correction proposals and produces verification evidence.
 */
export interface VerificationRun {
  /** Unique verification identifier */
  readonly id: string;

  /** The correction proposal being verified */
  readonly proposalId: string;

  /** Verification checks performed */
  readonly checks: readonly VerificationCheck[];

  /** Overall verification result */
  readonly result: VerificationResult;

  /** Verification evidence produced */
  readonly evidence: readonly VerificationEvidence[];

  /** ISO-8601 timestamp when verification started */
  readonly startedAt: string;

  /** ISO-8601 timestamp when verification completed */
  readonly completedAt?: string;

  /** Duration in milliseconds */
  readonly durationMs?: number;
}

/**
 * ENG-5: Individual verification check.
 */
export interface VerificationCheck {
  /** Check identifier */
  readonly id: string;

  /** Check name/description */
  readonly name: string;

  /** Check type */
  readonly type: VerificationCheckType;

  /** Check result */
  readonly result: 'passed' | 'failed' | 'skipped';

  /** Check details */
  readonly detail: string;

  /** Optional: evidence reference for this check */
  readonly evidenceRef?: string;
}

/**
 * ENG-5: Types of verification checks.
 */
export type VerificationCheckType =
  | 'file-exists'      // Verify a file exists
  | 'file-content'     // Verify file content matches expected
  | 'test-passes'      // Verify a test passes
  | 'build-passes'     // Verify build succeeds
  | 'lint-passes'      // Verify lint passes
  | 'endpoint-responds' // Verify an endpoint responds
  | 'data-preserved'   // Verify data was not lost
  | 'state-restored';  // Verify system state was restored

/**
 * ENG-5: Overall verification result.
 */
export type VerificationResult = 'passed' | 'failed' | 'partial';

/**
 * ENG-5: Verification evidence produced by a verification run.
 */
export interface VerificationEvidence {
  /** Evidence identifier */
  readonly id: string;

  /** Evidence type */
  readonly type: string;

  /** Evidence summary */
  readonly summary: string;

  /** Evidence content (may be truncated) */
  readonly content: string;

  /** ISO-8601 timestamp when evidence was produced */
  readonly producedAt: string;

  /** Bundle ID if evidence was stored in a PCS-026 bundle */
  readonly bundleId?: string;
}
