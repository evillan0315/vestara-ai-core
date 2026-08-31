/**
 * VESTARA-INTELLIGENCE GA-3: Surface Context Contract Types
 *
 * Bounded reference types for identifying where a human is in Vestara
 * and what bounded resources/capabilities they are interacting with.
 *
 * Surface Context = location + bounded references
 * NOT = assembled AI prompt/context
 *
 * These types are a deterministic client projection. They perform no
 * retrieval, ranking, search, generation, summarization, aggregation,
 * inference, routing, execution, or authorization.
 *
 * @see VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §4 (INV-CTX-1/2/3)
 */

// ─── Bounded Reference ────────────────────────────────────────

/**
 * Bounded reference to an entity or resource.
 * Follows the established *Ref pattern (DiagnosticSourceRef, ResourceRef).
 * Carries identity only — not the full entity.
 * Consumer resolves full entity via its own authority.
 */
export interface SurfaceReference {
  /** Entity kind (e.g., 'agent', 'plan', 'task', 'file'). Surface/module-generic. */
  readonly kind: string;
  /** Entity ID (e.g., 'developer-001', 'plan-abc'). */
  readonly id: string;
  /** Human-readable label (optional, for display only). Must not participate in authorization. */
  readonly label?: string;
}

// ─── Workspace Scope ──────────────────────────────────────────

/**
 * Workspace identity — bounded scope reference.
 * Does NOT include repoPath or repository binding details.
 * Existing RepositoryBinding authority resolves execution binding.
 */
export interface SurfaceWorkspace {
  /** WorkspaceManifestData.id (SHA-256 of canonical path). */
  readonly id: string;
  /** WorkspaceManifestData.name. */
  readonly name: string;
}

// ─── Surface Location ─────────────────────────────────────────

/**
 * Current surface/page location — where is the human?
 * Client-observed via React Router + NAV_CATEGORIES.
 */
export interface SurfaceLocation {
  /** APP_ROUTES match (null if route not in navigation manifest). */
  readonly routeId: string | null;
  /** useLocation().pathname. */
  readonly path: string;
  /** NAV_CATEGORIES title (null if no match). */
  readonly title: string | null;
  /** NAV_CATEGORIES category title (null if no match). */
  readonly section: string | null;
}

// ─── Complete Surface Context ─────────────────────────────────

/**
 * Complete Surface Context — location + bounded references.
 * Every field answers: where is the human? what bounded resource? under which workspace scope?
 * Passive data structure — no retrieval, ranking, budget, or lifecycle management.
 * Client-composed from existing hooks. No server endpoint.
 */
export interface SurfaceContext {
  /** Under which workspace scope? */
  readonly workspace: SurfaceWorkspace;
  /** Where is the human? */
  readonly surface: SurfaceLocation;
  /** What bounded resource? (optional — absence is normal) */
  readonly selected?: SurfaceReference;
}
