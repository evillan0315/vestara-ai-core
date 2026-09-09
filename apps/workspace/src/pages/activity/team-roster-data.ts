/**
 * AR-UI-A0: Authoritative Team Roster Data Layer
 *
 * Provides real agent data from the canonical agent registry,
 * replacing placeholder data in the Activity Room sidebar.
 *
 * Architecture Traceability:
 *   AR-UI-A: Authoritative Team Roster (phases 0-2)
 *   @see packages/workspace/src/agents.registry.ts (canonical agent source)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { AgentDefinition } from '@vestara/workspace';
import type {
  RosterActivityPreview,
  TeamRosterConfig,
  TeamRosterEntry,
  TeamRosterState,
} from './team-roster-types';
import { DEFAULT_ROSTER_CONFIG } from './team-roster-types';

// ─── API Client ────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Roster Data Layer ─────────────────────────────────────────

/**
 * AR-UI-A0: Fetches real agent data from the API and builds
 * the authoritative team roster.
 */
export class TeamRosterDataLayer {
  private config: TeamRosterConfig;
  private entries: Map<string, TeamRosterEntry> = new Map();
  private lastFetchedAt: number = 0;
  private fetchPromise: Promise<void> | null = null;

  constructor(config?: Partial<TeamRosterConfig>) {
    this.config = { ...DEFAULT_ROSTER_CONFIG, ...config };
  }

  /**
   * AR-UI-A0: Fetch agents from the API and build roster entries.
   * Caches results for 5 seconds to avoid hammering the API.
   */
  async fetchRoster(): Promise<TeamRosterState> {
    // Debounce concurrent fetches
    if (this.fetchPromise) {
      await this.fetchPromise;
      return this.buildState();
    }

    // Cache for 5 seconds
    if (Date.now() - this.lastFetchedAt < 5000) {
      return this.buildState();
    }

    this.fetchPromise = this.doFetch();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }

    return this.buildState();
  }

  /**
   * AR-UI-A0: Fetch agents from the API.
   */
  private async doFetch(): Promise<void> {
    try {
      const data = await apiFetch<{ agents: AgentDefinition[] }>('/api/agents');
      const agents = data.agents ?? [];

      this.entries.clear();
      for (const agent of agents) {
        const entry = this.buildEntry(agent);
        if (this.shouldInclude(agent)) {
          this.entries.set(agent.id, entry);
        }
      }

      this.lastFetchedAt = Date.now();
    } catch (err) {
      console.warn('Failed to fetch agent roster:', err);
    }
  }

  /**
   * AR-UI-A0: Build a roster entry from an agent definition.
   */
  private buildEntry(agent: AgentDefinition): TeamRosterEntry {
    return {
      agent,
      runtimeStatus: this.inferRuntimeStatus(agent),
      activeWorkCount: 0, // Will be enriched by Activity Room data
      latestActivity: undefined,
      isSelected: false,
    };
  }

  /**
   * AR-UI-A0: Infer runtime status from agent definition.
   * In production, this would be enriched by real-time telemetry.
   */
  private inferRuntimeStatus(agent: AgentDefinition): TeamRosterEntry['runtimeStatus'] {
    if (agent.status === 'disabled') return 'offline';
    return 'idle';
  }

  /**
   * AR-UI-A0: Check if an agent should be included in the roster.
   */
  private shouldInclude(agent: AgentDefinition): boolean {
    // Filter by type
    if (this.config.filterTypes.length > 0 && !this.config.filterTypes.includes(agent.agentType)) {
      return false;
    }

    // Filter by origin
    if (this.config.filterOrigins.length > 0 && !this.config.filterOrigins.includes(agent.origin ?? 'user')) {
      return false;
    }

    return true;
  }

  /**
   * AR-UI-A0: Build the current roster state.
   */
  private buildState(): TeamRosterState {
    let entries = Array.from(this.entries.values());

    // Apply filters
    if (!this.config.showIdle) {
      entries = entries.filter((e) => e.runtimeStatus !== 'idle');
    }
    if (!this.config.showOffline) {
      entries = entries.filter((e) => e.runtimeStatus !== 'offline');
    }

    // Apply sorting
    entries = this.sortEntries(entries);

    const activeCount = entries.filter(
      (e) => e.runtimeStatus === 'working' || e.runtimeStatus === 'waiting',
    ).length;
    const idleCount = entries.filter((e) => e.runtimeStatus === 'idle').length;
    const errorCount = entries.filter((e) => e.runtimeStatus === 'error').length;

    return {
      entries,
      activeCount,
      idleCount,
      errorCount,
      totalCount: entries.length,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /**
   * AR-UI-A0: Sort roster entries by the configured sort order.
   */
  private sortEntries(entries: TeamRosterEntry[]): TeamRosterEntry[] {
    const sorted = [...entries];

    switch (this.config.sortBy) {
      case 'name':
        sorted.sort((a, b) => a.agent.name.localeCompare(b.agent.name));
        break;
      case 'status':
        sorted.sort((a, b) => this.statusWeight(a.runtimeStatus) - this.statusWeight(b.runtimeStatus));
        break;
      case 'activity':
        sorted.sort((a, b) => {
          const aTime = a.latestActivity?.timestamp ?? '';
          const bTime = b.latestActivity?.timestamp ?? '';
          return bTime.localeCompare(aTime);
        });
        break;
      case 'role':
        sorted.sort((a, b) => a.agent.role.localeCompare(b.agent.role));
        break;
    }

    return sorted;
  }

  /**
   * AR-UI-A0: Weight for status sorting (lower = higher priority).
   */
  private statusWeight(status: TeamRosterEntry['runtimeStatus']): number {
    switch (status) {
      case 'working': return 0;
      case 'waiting': return 1;
      case 'error': return 2;
      case 'idle': return 3;
      case 'offline': return 4;
      default: return 5;
    }
  }

  /**
   * AR-UI-A0: Update an agent's runtime status.
   * Called by the Activity Room when real-time data arrives.
   */
  updateAgentStatus(agentId: string, status: TeamRosterEntry['runtimeStatus']): void {
    const entry = this.entries.get(agentId);
    if (entry) {
      this.entries.set(agentId, { ...entry, runtimeStatus: status });
    }
  }

  /**
   * AR-UI-A0: Update an agent's latest activity.
   * Called by the Activity Room when new activity arrives.
   */
  updateAgentActivity(agentId: string, activity: RosterActivityPreview): void {
    const entry = this.entries.get(agentId);
    if (entry) {
      this.entries.set(agentId, { ...entry, latestActivity: activity });
    }
  }

  /**
   * AR-UI-A0: Update an agent's active work count.
   * Called by the Activity Room when tasks are assigned/completed.
   */
  updateAgentWorkCount(agentId: string, count: number): void {
    const entry = this.entries.get(agentId);
    if (entry) {
      this.entries.set(agentId, { ...entry, activeWorkCount: count });
    }
  }

  /**
   * AR-UI-A0: Mark an agent as selected in the roster.
   */
  selectAgent(agentId: string | null): void {
    for (const [id, entry] of this.entries) {
      this.entries.set(id, { ...entry, isSelected: id === agentId });
    }
  }

  /**
   * AR-UI-A0: Get the current roster state.
   */
  getState(): TeamRosterState {
    return this.buildState();
  }
}
