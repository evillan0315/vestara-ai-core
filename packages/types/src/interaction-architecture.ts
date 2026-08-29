/**
 * AR-REC-B B1: Architecture Selection Record
 *
 * Selects the minimum owning abstraction for Vestara's bounded structured
 * recommendation/choice interaction capability.
 *
 * Frozen baseline: AR-REC-A at 355922b
 */

// ─── Candidate Evaluation ────────────────────────────────────

/**
 * Candidate A: Activity-Record Extension
 *
 * REJECTED — Would make M9 projection → command owner.
 *
 * Evidence:
 * - M9 Activity records are projection/read-model infrastructure (activity.ts:9-16)
 * - ActivityType includes 'human.message' but not recommendation/choice semantics
 * - ActivityRecord carries actor, timestamp, payload — but is a durable projection of
 *   authoritative platform facts, not a command authority
 * - Making M9 own recommendation semantics would make Activity Room → authority
 * - Activity Room MUST NOT interpret recommendation choices as executable operations
 *
 * Trade-offs:
 * + Already has correlation fields, provenance, persistence
 * + Already consumed by M9 ingestion bridge
 * - Projection layer would become command owner
 * - Activity records are append-only facts, not interaction state
 * - Would require ActivityRecord to carry choice identity, response, lifecycle
 * - Violates: "M9 remains projection/read-model infrastructure unless evidence
 *   establishes otherwise"
 */

/**
 * Candidate B: Conversation/Message Extension
 *
 * REJECTED — Semantic ownership and coupling violation.
 *
 * Evidence:
 * - Message owns communication content/history (shared/src/conversation-types.ts:22-33)
 * - StructuredInteraction owns independently addressable interaction semantics
 * - Interactions may originate outside Conversation (Activity Room, future consumers)
 * - Interaction identity/choices/responses should not depend on Conversation ownership
 * - Conversation may later reference/carry an interaction without becoming its canonical owner
 * - Candidate C remains reusable across Conversation, Activity Room, and future unknown consumers
 *
 * Ownership boundary:
 *   Conversation owns messaging. StructuredInteraction owns interaction semantics.
 *   Governance owns authority.
 *
 * Trade-offs:
 * + ConversationContext already conceptually supports structured responses
 * + Human text messaging already flows through conversation
 * - Would require Message to carry choice identity, selection, response
 * - Couples interaction semantics to Conversation lifecycle
 * - Not all interactions originate from conversations
 * - Prevents reuse by Activity Room, future consumers independent of Conversation
 */

/**
 * Candidate C: Generic Structured-Interaction Contract
 *
 * SELECTED — Smallest abstraction that owns the semantics truthfully.
 *
 * Evidence:
 * - The core semantics are: one party presents options, another party selects
 * - This is a domain-neutral interaction pattern, not a domain-specific concept
 * - Works for recommendations, suggestions, proposals, and unknown future domains
 * - Doesn't create parallel governance (it's a generic interaction, not an approval)
 * - Can be projected to M9 without M9 becoming authoritative
 * - Can carry correlation/provenance without conferring authority
 *
 * Trade-offs:
 * + Domain-neutral: works across workspace, orchestration, execution, conversation
 * + Future-proof: works for domains unknown to today's Activity Room
 * + Doesn't create parallel governance
 * + Smallest implementation surface
 * + Choice identity is correlation, not authority
 * - Requires defining new types (not reusing existing)
 * - Domain-specific semantics (rationale, confidence) are higher-level concerns
 *
 * Why this is the minimum owning abstraction:
 * - The contract owns "interaction pattern" semantics truthfully
 * - It doesn't own "recommendation" semantics (that's a higher-level concern)
 * - It doesn't own "approval" semantics (that's the existing governance system)
 * - It's the smallest unit that can represent the full interaction lifecycle
 */

/**
 * Candidate D: First-Class Recommendation Contract
 *
 * REJECTED — Too specific for the minimum abstraction.
 *
 * Evidence:
 * - "Recommendation" implies domain-specific intent (recommend, suggest, propose)
 * - The actual pattern is generic: present options, capture selection
 * - A first-class Recommendation would need rationale, confidence, source, impact
 * - These are higher-level concerns that don't belong in the minimum contract
 * - Would create a domain-specific contract when the pattern is generic
 * - A dedicated service/store/event namespace is not implied, but the type itself
 *   would carry domain-specific baggage
 *
 * Trade-offs:
 * + Explicitly named for the primary use case
 * + Carries recommendation-specific fields (rationale, confidence)
 * - Too specific for the minimum abstraction
 * - Creates domain-specific contract when pattern is generic
 * - Less reusable for unknown future domains
 * - Violates: "choose the smallest abstraction that owns the semantics truthfully"
 */

// ─── Selection Record ────────────────────────────────────────

/**
 * B1 Architecture Selection Record
 *
 * Selected abstraction: Generic Structured-Interaction Contract (Candidate C)
 *
 * Selection rule applied: "choose the smallest abstraction that owns the
 * semantics truthfully. Do not choose the smallest diff merely because it
 * requires less code."
 *
 * The semantics are: "a bounded structured interaction where one party
 * presents options and another party selects." This is a domain-neutral
 * interaction pattern. The minimum owning abstraction is a generic
 * structured-interaction contract, not a domain-specific Recommendation.
 *
 * Rejected alternatives:
 * - A (Activity-record extension): Would make M9 projection → command owner
 * - B (Conversation/message extension): Semantic ownership/coupling — interaction identity must not depend on Conversation ownership
 * - D (First-class Recommendation): Too specific for minimum abstraction
 *
 * Invariants preserved:
 * - Recommendation does not confer authority
 * - Human choice/intent ≠ Governance approval ≠ Authorization
 * - Decision does not bypass governance
 * - Activity Room MUST NOT interpret choices as executable operations
 * - No parallel governance system created
 *
 * Persistence and events:
 * - No new persistence at B stage — contract is a type; persistence is an integration concern
 * - No new events at B stage — contract defines type structure; event integration is a later concern
 * - Persistence, projection/event integration, and transport integration are later integration
 *   concerns requiring explicit authorization and ownership selection
 * - A following milestone does not acquire those responsibilities merely because it follows B
 *
 * Participant identity:
 * - Participant IDs follow existing Vestara string conventions (ActivityActor.id,
 *   ParticipantProjection.participantId)
 * - Authoritative identity validation remains an integration responsibility
 * - AR-REC-B does not introduce a new participant identity subsystem
 */
