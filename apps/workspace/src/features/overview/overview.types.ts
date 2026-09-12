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
  readonly type: 'execution' | 'workflow' | 'conversation' | 'file' | 'project' | 'repository';

  /** Item status */
  readonly status: 'running' | 'completed' | 'paused' | 'failed';

  /** Last updated timestamp (ISO-8601) */
  readonly updatedAt: string;

  /** Progress percentage (0-100) */
  readonly progress?: number;

  /** VCS branch (v2 Continue Working row) */
  readonly branch?: string;

  /** Workspace-relative path (v2 Continue Working row) */
  readonly path?: string;
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
  readonly kind: 'execution' | 'message' | 'file-change' | 'agent-action' | 'workflow' | 'issue' | 'module';

  /** Short title for v2 Recent Activity row */
  readonly title?: string;

  /** Detail line for v2 Recent Activity row */
  readonly detail?: string;
}

// ─── Agent Summary ─────────────────────────────────────────────

export interface OverviewAgentSummary {
  /** Agent ID */
  readonly id: string;

  /** Agent name */
  readonly name: string;

  /** Agent role */
  readonly role: string;

  /** Agent status — v2 adds online/busy presence; working kept as legacy alias of busy */
  readonly status: 'online' | 'busy' | 'idle' | 'offline' | 'working';

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

  /** Short description (v2 Projects card) */
  readonly description?: string;

  /** Starred / favorite (v2 Projects card) */
  readonly starred?: boolean;
}

// ─── Resource Summary ──────────────────────────────────────────

export interface OverviewResourceSummary {
  /** CPU usage percentage (0-100) */
  readonly cpu: number;

  /** Memory usage percentage (0-100) */
  readonly memory: number;

  /** Disk usage percentage (0-100, optional) */
  readonly disk?: number;

  /** Network usage percentage (0-100, v2 gauge) */
  readonly network?: number;

  /** System uptime */
  readonly uptime: string;

  /** Active sessions count */
  readonly activeSessions: number;

  /** Human-readable detail lines for v2 gauges (e.g. "1.4 / 8 cores") */
  readonly cpuDetail?: string;

  /** Human-readable detail lines for v2 gauges (e.g. "4.9 / 8 GB") */
  readonly memoryDetail?: string;

  /** Human-readable detail lines for v2 gauges (e.g. "82 / 238 GB") */
  readonly diskDetail?: string;

  /** Human-readable network throughput (e.g. "12.4 MB/s up") */
  readonly networkDetail?: string;
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

  /** Short description (v2 Spotlight card) */
  readonly description?: string;

  /** Rating count (v2 Spotlight card, e.g. 120) */
  readonly ratingCount?: number;
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

  /** Checked state for v2 Today's Focus checklist */
  readonly completed?: boolean;

  /** Optional action link */
  readonly action?: {
    /** Action label */
    readonly label: string;

    /** Action href */
    readonly href: string;
  };
}
