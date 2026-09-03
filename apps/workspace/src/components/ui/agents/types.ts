/**
 * Shared agent types for cross-surface agent UI primitives.
 *
 * These types represent the minimal contract between Agent Control,
 * Activity Room, and future surfaces (Marketplace, Agent Builder).
 *
 * Authority: GET /api/agents is the single source of truth for agent data.
 * These types do NOT define agent identity — the backend does.
 */

/**
 * Minimal agent identity — sufficient for display and selection.
 * Mirrors the shape returned by GET /api/agents.
 */
export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  description?: string;
  color?: string;
  status?: string;
  provider?: string;
  model?: string;
  runtimeAgent?: string;
  capabilities?: string[];
  teamId?: string;
  createdAt?: string;
}

/**
 * Agent execution stats — from GET /api/agents response.
 */
export interface AgentStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  avgDuration: number;
  successRate?: number;
}

/**
 * Data for creating/updating an agent — from AgentEditor form.
 * This is what the form submits, not what the API returns.
 */
export interface AgentSaveData {
  name: string;
  role: string;
  description?: string;
  provider?: string;
  model?: string;
  runtimeAgent?: string;
  capabilities?: string[];
  color?: string;
  teamId?: string;
}

/**
 * Team reference — for team assignment in agent editor.
 */
export interface TeamRef {
  id: string;
  name: string;
  description?: string;
}
