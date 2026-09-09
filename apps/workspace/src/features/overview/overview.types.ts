/**
 * VES-OVERVIEW-001: Overview Types
 *
 * Types for the Overview screen — the stable default entry point
 * into a Vestara workspace. Read-only view model assembled from
 * multiple domain services.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Overview View Model ───────────────────────────────────────

export interface OverviewViewModel {
  /** Workspace summary */
  readonly workspace: OverviewWorkspaceSummary;

  /** Recent work items for "Continue Working" */
  readonly continueWorking: readonly OverviewRecentWorkItem[];

  /** Recent activity from agents, executions, files */
  readonly recentActivity: readonly OverviewActivityItem[];

  /** Agent status summary */
  readonly agents: readonly OverviewAgentSummary[];

  /** Project summary */
  readonly projects: readonly OverviewProjectSummary[];

  /** System resource usage */
  readonly resources: OverviewResourceSummary;

  /** Marketplace items */
  readonly marketplace: readonly OverviewMarketplaceItem[];

  /** Today's focus items */
  readonly focus: readonly OverviewFocusItem[];
}

// ─── Workspace Summary ─────────────────────────────────────────

export interface OverviewWorkspaceSummary {
  /** Workspace name */
  readonly name: string;

  /** Workspace description */
  readonly description: string;

  /** Last activity timestamp (ISO-8601) */
  readonly lastActivity: string;

  /** Workspace health */
  readonly health: 'healthy' | 'degraded' | 'error';
}

// ─── Recent Work Item ──────────────────────────────────────────

export interface OverviewRecentWorkItem {
  /** Item ID */
  readonly id: string;

  /** Item title */
  readonly title: string;

  /** Item type */
  readonly type: 'execution' | 'workflow' | 'conversation' | 'file';

  /** Item status */
  readonly status: 'running' | 'completed' | 'paused' | 'failed';

  /** Last updated timestamp (ISO-8601) */
  readonly updatedAt: string;

  /** Progress percentage (0-100) */
  readonly progress?: number;
}

// ─── Activity Item ─────────────────────────────────────────────

export interface OverviewActivityItem {
  /** Activity ID */
  readonly id: string;

  /** Actor name (agent or human) */
  readonly actor: string;

  /** Action description (verb phrase) */
  readonly action: string;

  /** Optional target */
  readonly target?: string;

  /** Timestamp (ISO-8601) */
  readonly timestamp: string;

  /** Activity kind */
  readonly kind: 'execution' | 'message' | 'file-change' | 'agent-action';
}

// ─── Agent Summary ─────────────────────────────────────────────

export interface OverviewAgentSummary {
  /** Agent ID */
  readonly id: string;

  /** Agent name */
  readonly name: string;

  /** Agent role */
  readonly role: string;

  /** Agent status */
  readonly status: 'idle' | 'working' | 'offline';

  /** Current task (if working) */
  readonly currentTask?: string;

  /** AI model */
  readonly model: string;
}

// ─── Project Summary ───────────────────────────────────────────

export interface OverviewProjectSummary {
  /** Project ID */
  readonly id: string;

  /** Project name */
  readonly name: string;

  /** Primary language */
  readonly language?: string;

  /** Project health */
  readonly health: 'healthy' | 'degraded' | 'error';

  /** Last activity timestamp (ISO-8601) */
  readonly lastActivity: string;

  /** File count */
  readonly fileCount?: number;
}

// ─── Resource Summary ──────────────────────────────────────────

export interface OverviewResourceSummary {
  /** CPU usage percentage (0-100) */
  readonly cpu: number;

  /** Memory usage percentage (0-100) */
  readonly memory: number;

  /** Disk usage percentage (0-100, optional) */
  readonly disk?: number;

  /** System uptime */
  readonly uptime: string;

  /** Active sessions count */
  readonly activeSessions: number;
}

// ─── Marketplace Item ──────────────────────────────────────────

export interface OverviewMarketplaceItem {
  /** Item ID */
  readonly id: string;

  /** Item name */
  readonly name: string;

  /** Item category */
  readonly category: string;

  /** Whether item is installed */
  readonly installed: boolean;

  /** Item rating (0-5, optional) */
  readonly rating?: number;
}

// ─── Focus Item ────────────────────────────────────────────────

export interface OverviewFocusItem {
  /** Focus item ID */
  readonly id: string;

  /** Focus item title */
  readonly title: string;

  /** Why this is a focus item */
  readonly reason: string;

  /** Priority level */
  readonly priority: 'high' | 'medium' | 'low';

  /** Optional action link */
  readonly action?: {
    /** Action label */
    readonly label: string;

    /** Action href */
    readonly href: string;
  };
}
