/**
 * AR-REC-B: Generic Structured-Interaction Contract
 *
 * Canonical types for presenting bounded structured interactions and
 * correlating opaque human responses. This is a domain-neutral interaction
 * pattern — not a recommendation, not an approval, not an execution command.
 *
 * Architectural invariants:
 *   - A choice expresses human intent within an interaction
 *   - A choice does NOT grant operational approval
 *   - A choice does NOT produce approvalGranted, policy allows, or equivalent authority
 *   - Choice identity is correlation, not authority
 *   - The contract carries no executable semantics (no commands, shell commands,
 *     operations, handlers, endpoints, tool calls, or equivalent)
 *
 * Ownership:
 *   - This contract defines the interaction pattern
 *   - Domain-specific semantics (rationale, confidence) are higher-level concerns
 *   - Existing approval pipelines remain independently authoritative
 *   - Activity Room projects this contract but does not own it
 *
 * Frozen baseline: AR-REC-A at 355922b
 * Selection: B1 Architecture Selection Record (Candidate C)
 */

import type { Brand, Timestamp } from './common';

// ─── Identity Types ──────────────────────────────────────────

/** Stable identity for a structured interaction. Machine-correlatable, immutable. */
export type InteractionId = Brand<string, 'InteractionId'>;

/** Stable opaque identity for a choice within an interaction. Machine-correlatable. */
export type ChoiceId = Brand<string, 'ChoiceId'>;

// ─── Interaction Presentation ────────────────────────────────

/**
 * A single choice within a structured interaction.
 *
 * The label is presentation-only. The choiceId is correlation.
 * Choice identity MUST NOT derive executable meaning from the label.
 */
export interface InteractionChoice {
  /** Stable opaque identity for this choice. Correlation, not authority. */
  readonly choiceId: ChoiceId;

  /** Human-readable presentation label. Display only — no operational meaning. */
  readonly label: string;

  /** Optional bounded explanatory content. Display only. */
  readonly description?: string;
}

/**
 * A structured interaction presented to a human.
 *
 * Represents: one party presents options, another party may select.
 * This is the "presented" fact — not an approval request, not an execution command.
 *
 * The contract intentionally carries no executable semantics:
 *   - No command, shellCommand, operation, execute, handler, endpoint, route
 *   - No toolCall, approvalGranted, policyOverride, permissionOverride
 *   - No client-defined executable payloads
 *   - Opaque metadata is constrained (see InteractionMetadata)
 */
export interface StructuredInteraction {
  /** Stable identity for this interaction. Immutable. */
  readonly interactionId: InteractionId;

  /**
   * Optional correlation to a conversation/context.
   * Undefined when the interaction is not conversation-contextualized.
   */
  readonly conversationId?: string;

  /**
   * Identity of the participant who presented this interaction.
   * For agent-originated: the agent ID. For system-originated: 'system'.
   */
  readonly presentingParticipantId: string;

  /** Display name of the presenting participant. Presentation only. */
  readonly presentingParticipantName: string;

  /** When this interaction was created. */
  readonly createdAt: Timestamp;

  /**
   * Human-readable prompt or content describing the interaction.
   * This is the primary content the human reads to make a choice.
   */
  readonly content: string;

  /**
   * Ordered collection of choices. Minimum 1, maximum bounded by presentation.
   * Order is significant for presentation but does not imply priority or authority.
   */
  readonly choices: readonly InteractionChoice[];

  /**
   * Optional bounded metadata for extensibility.
   *
   * Authority semantics: This field MUST NOT contain executable semantics.
   * It may carry domain-specific presentation hints (e.g., "category: workspace")
   * but these are display-only and do not confer authority.
   *
   * Constraints:
   *   - Keys MUST be namespaced (e.g., "vestara.category")
   *   - Values MUST be JSON primitive or structured data (no functions, no handlers)
   *   - Total size SHOULD be bounded (< 4KB recommended)
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── Interaction Response ────────────────────────────────────

/**
 * A human response to a structured interaction.
 *
 * Represents: the human selected a choice. This is a fact — an intent expression.
 * It does NOT represent approval, authorization, or execution permission.
 *
 * Response semantics:
 *   - A response is idempotent: replaying does not create a second decision
 *   - A response references the originating interaction by interactionId
 *   - A response identifies the selected choice by choiceId (opaque, not label)
 *   - A response records the responding participant for provenance
 */
export interface InteractionResponse {
  /** Stable identity for this response. Immutable. */
  readonly responseId: Brand<string, 'ResponseId'>;

  /** Reference to the originating interaction. */
  readonly interactionId: InteractionId;

  /** The selected choice identity. Opaque correlation, not authority. */
  readonly selectedChoiceId: ChoiceId;

  /**
   * Identity of the participant who made this choice.
   * Must match a valid participant in the interaction context.
   */
  readonly respondingParticipantId: string;

  /** Display name of the responding participant. Presentation only. */
  readonly respondingParticipantName: string;

  /** When this response was recorded. */
  readonly respondedAt: Timestamp;

  /**
   * Correlation/provenance for safe replay.
   * Used to detect and reject duplicate responses.
   */
  readonly correlationId?: string;
}

// ─── Interaction Lifecycle ───────────────────────────────────

/**
 * Lifecycle state of a structured interaction.
 *
 * Derived from facts, not persisted as execution state:
 *   - 'presented': interaction exists and awaits response
 *   - 'responded': human has selected a choice
 *   - 'expired': interaction is stale (downstream authorities must re-evaluate)
 *
 * Lifecycle transitions are facts/events, not commands.
 * A stale recommendation must not become permanent execution capability.
 */
export type InteractionLifecycle = 'presented' | 'responded' | 'expired';

// ─── Type Guards ─────────────────────────────────────────────

/**
 * Type guard: check if a value is a StructuredInteraction.
 * Prevents accidental substitution with approval DTOs or other domain types.
 */
export function isStructuredInteraction(value: unknown): value is StructuredInteraction {
  return (
    typeof value === 'object' &&
    value !== null &&
    'interactionId' in value &&
    'content' in value &&
    'choices' in value &&
    'presentingParticipantId' in value &&
    'createdAt' in value
  );
}

/**
 * Type guard: check if a value is an InteractionResponse.
 * Prevents accidental substitution with approval decisions or policy results.
 */
export function isInteractionResponse(value: unknown): value is InteractionResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'responseId' in value &&
    'interactionId' in value &&
    'selectedChoiceId' in value &&
    'respondingParticipantId' in value &&
    'respondedAt' in value
  );
}

// ─── Exclusion声明 ───────────────────────────────────────────
//
// This contract explicitly DOES NOT contain:
//   - command, shellCommand, operation, execute, handler, endpoint, route
//   - toolCall, approvalGranted, policyOverride, permissionOverride
//   - runtime execution, installation, removal, deployment, mutation
//   - any field that could become an escape hatch for executable semantics
//
// A choice expresses human intent. It does not grant operational approval.
// Existing approval pipelines remain independently authoritative.
