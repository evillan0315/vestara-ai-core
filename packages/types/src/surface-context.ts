/**
 * VESTARA-INTELLIGENCE GA-3: Surface Context Contract Types
 *
 * Defines the minimum stable TypeScript contracts for Surface Context —
 * the client-composed representation of "where is the human in Vestara,
 * and what bounded resources/capabilities are they currently interacting with?"
 *
 * Ownership:
 * - These types define the CONTRACT boundary for client-composed Surface Context.
 * - No server endpoint. No new persistence. Client composes from existing hooks.
 * - Existing authorities retain ownership: WorkspaceManifest (workspace identity),
 *   RepositoryBinding (execution binding), React Router (route state),
 *   GraphContext (selected entity).
 *
 * Design constraints:
 * - Surface Context is a passive data structure — no retrieval, ranking, budget, or lifecycle.
 * - Surface Context does NOT carry: diagnostics, conversation state, connection state,
 *   actor identity, repository binding details, or full entity payloads.
 * - Surface-generic: no Activity Room, Workflow, or domain-specific fields.
 * - Degrades by losing optional references, not collapsing globally.
 *
 * Future phases:
 * - GA-2 (Conversation): Surface Context may be consumed alongside conversation state.
 * - GA-1 (Floating Assistant): Surface Context provides location context for the assistant.
 * - Context Intelligence: May consume Surface Context as one input among many.
 *
 * @see VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Surface Reference ──────────────────────────────────────────────────────

/**
 * Bounded reference to an entity or resource.
 * Follows the established *Ref pattern (DiagnosticSourceRef, ResourceRef).
 * Carries identity only — not the full entity.
 * Consumer resolves full entity via its own authority.
 */
export interface SurfaceReference {
  /** Entity kind (e.g., 'agent', 'plan', 'task', 'file', 'workflow') */
  readonly kind: string;

  /** Entity ID (e.g., 'developer-001', 'plan-abc') */
  readonly id: string;

  /** Human-readable label (optional, for display) */
  readonly label?: string;
}

// ─── Workspace Identity ─────────────────────────────────────────────────────

/**
 * Workspace identity — bounded scope reference.
 * Does NOT include repoPath or repository binding details.
 * Existing RepositoryBinding authority resolves execution binding.
 */
export interface SurfaceWorkspace {
  /** WorkspaceManifestData.id (SHA-256 of canonical path) */
  readonly id: string;

  /** WorkspaceManifestData.name */
  readonly name: string;
}

// ─── Surface Location ───────────────────────────────────────────────────────

/**
 * Current surface/page location — where is the human?
 * Client-observed via React Router + NAV_CATEGORIES.
 */
export interface SurfaceLocation {
  /** APP_ROUTES match (e.g., 'activity-v2', 'sessions', 'graph') */
  readonly routeId: string | null;

  /** useLocation().pathname (e.g., '/activity-v2') */
  readonly path: string;

  /** NAV_CATEGORIES title (e.g., 'Activity Room (M11C)') */
  readonly title: string | null;

  /** NAV_CATEGORIES category (e.g., 'Workspace') */
  readonly section: string | null;
}

// ─── Surface Context ────────────────────────────────────────────────────────

/**
 * Complete Surface Context — location + bounded references.
 * Every field answers: where is the human? what bounded resource? under which workspace scope?
 * Passive data structure — no retrieval, ranking, budget, or lifecycle management.
 * Client-composed from existing hooks. No server endpoint.
 */
export interface SurfaceContext {
  /** Under which workspace scope? (server-derived, client-cached) */
  readonly workspace: SurfaceWorkspace;

  /** Where is the human? (client-observed via React Router + NAV_CATEGORIES) */
  readonly surface: SurfaceLocation;

  /** What bounded resource? (optional — not all surfaces have an Inspector entity) */
  readonly selected?: SurfaceReference;
}
