/**
 * HumanKnowledgeItem — governed knowledge about a human (HUMAN-CONTEXT-003).
 *
 * Storage authority, NOT publication authority:
 *   PUBLIC sensitivity ≠ automatically published
 *   agentReadable=true ≠ automatically retrievable
 * Those decisions belong to projection/retrieval/policy milestones (004+).
 *
 * Binding invariants (HUMAN-CONTEXT-003, authorized):
 *   Stored ≠ Verified · Stated ≠ Proven · Inferred ≠ Fact
 *   Private ≠ Agent-readable · Public ≠ Relevant
 *   Agent-readable ≠ Authorized for every agent
 *   Primary subject ≠ Related subject
 *   Profile knowledge ≠ Memory · Profile knowledge ≠ Instruction
 *
 * Confidence semantics: confidence in the assertion/provenance relationship,
 * NOT a universal probability that the underlying claim is true. It is never
 * derived mechanically from verificationStatus — VERIFIED material can carry
 * interpretive uncertainty, and SELF_DESCRIBED material can carry high
 * confidence-that-stated without independent verification of the claim.
 *
 * No speculative `scope` dimension. `subdomain` is the sole closed policy
 * axis; if a use case proves it insufficient, HOLD and report — do not
 * invent another axis here.
 *
 * Architecture Traceability:
 *   HUMAN-CONTEXT-001 — ownership audit (frozen)
 *   HUMAN-CONTEXT-002 — HumanPrincipal identity (frozen)
 *   HUMAN-CONTEXT-003 — governed knowledge substrate (this milestone)
 */

/** Closed policy axis. The only categorical dimension for future 004 policy. */
export type HumanKnowledgeSubdomain =
  | 'professional'
  | 'career'
  | 'technical'
  | 'skills'
  | 'projects'
  | 'goals'
  | 'working-preferences'
  | 'personal'
  | 'biography';

export const HUMAN_KNOWLEDGE_SUBDOMAINS: readonly HumanKnowledgeSubdomain[] = [
  'professional',
  'career',
  'technical',
  'skills',
  'projects',
  'goals',
  'working-preferences',
  'personal',
  'biography',
];

/**
 * Epistemic category of the item. Distinct ways of knowing — never flattened
 * into a generic "memory". A DOCUMENTED FACT, an APPROXIMATE RECOLLECTION,
 * and a SUBJECTIVE EXPERIENCE can coexist about the same life without
 * normalization.
 */
export type HumanVerificationStatus = 'VERIFIED' | 'SELF_DESCRIBED' | 'APPROXIMATE' | 'SUBJECTIVE' | 'INTERPRETATION';

export const HUMAN_VERIFICATION_STATUSES: readonly HumanVerificationStatus[] = [
  'VERIFIED',
  'SELF_DESCRIBED',
  'APPROXIMATE',
  'SUBJECTIVE',
  'INTERPRETATION',
];

export type HumanSensitivity = 'PUBLIC' | 'PROFESSIONAL' | 'PRIVATE' | 'RESTRICTED';

export const HUMAN_SENSITIVITIES: readonly HumanSensitivity[] = ['PUBLIC', 'PROFESSIONAL', 'PRIVATE', 'RESTRICTED'];

/** Default-deny: ingestion grants nothing. */
export const HUMAN_KNOWLEDGE_DEFAULT_SENSITIVITY: HumanSensitivity = 'PRIVATE';
export const HUMAN_KNOWLEDGE_DEFAULT_AGENT_READABLE = false;

export interface HumanTimeRange {
  from?: string;
  to?: string;
  /** True when the range itself is acknowledged imprecise (e.g. "around 2010"). */
  approximate?: boolean;
}

export interface HumanKnowledgeMeta {
  /** Human-meaningful origin label (e.g. 'w-2', 'eddie-recollection'). Required. */
  source: string;
  /** Supporting artifact/event ids. Empty is valid (recollection has no artifacts). */
  provenance: string[];
  timeRange?: HumanTimeRange;
  verificationStatus: HumanVerificationStatus;
  /**
   * Confidence (0–1) in the assertion/provenance relationship — e.g. how
   * confident we are that this source supports this assertion as described.
   * Explicitly required; never defaulted from verificationStatus.
   */
  confidence: number;
  sensitivity: HumanSensitivity;
  agentReadable: boolean;
  /**
   * Person this item is PRIMARILY about. A relational event involving another
   * person keeps the owner as primary; the other person goes in
   * relatedSubjectRefs — never promoted to primary by storage or round-trip.
   */
  primarySubjectRef?: string;
  relatedSubjectRefs: string[];
}

export interface HumanKnowledgeItem<T = string> {
  readonly id: string;
  /** Owning principal. Every operation is scoped by (principalId, id). */
  readonly principalId: string;
  readonly subdomain: HumanKnowledgeSubdomain;
  /** Per-subdomain label (e.g. 'role-summary', 'career-entry', 'goal'). */
  readonly kind: string;
  readonly value: T;
  readonly meta: HumanKnowledgeMeta;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type HumanKnowledgeMetaInput = Omit<
  HumanKnowledgeMeta,
  'sensitivity' | 'agentReadable' | 'provenance' | 'relatedSubjectRefs'
> & {
  sensitivity?: HumanSensitivity;
  agentReadable?: boolean;
  provenance?: string[];
  relatedSubjectRefs?: string[];
};

export interface HumanKnowledgeInput<T = string> {
  subdomain: HumanKnowledgeSubdomain;
  kind: string;
  value: T;
  meta: HumanKnowledgeMetaInput;
}

export interface HumanKnowledgeUpdate<T = string> {
  kind?: string;
  value?: T;
  meta?: Partial<
    Omit<HumanKnowledgeMeta, 'sensitivity' | 'agentReadable'> & {
      sensitivity?: HumanSensitivity;
      agentReadable?: boolean;
    }
  >;
}

export function isHumanKnowledgeSubdomain(value: unknown): value is HumanKnowledgeSubdomain {
  return (HUMAN_KNOWLEDGE_SUBDOMAINS as readonly unknown[]).includes(value);
}

export function isHumanVerificationStatus(value: unknown): value is HumanVerificationStatus {
  return (HUMAN_VERIFICATION_STATUSES as readonly unknown[]).includes(value);
}

export function isHumanSensitivity(value: unknown): value is HumanSensitivity {
  return (HUMAN_SENSITIVITIES as readonly unknown[]).includes(value);
}

export function isValidHumanConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
