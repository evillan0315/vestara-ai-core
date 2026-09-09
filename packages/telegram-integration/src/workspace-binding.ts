/**
 * VES-TG-008: Telegram Workspace Binding
 *
 * Manages workspace selection for Telegram users.
 * A Telegram user may have multiple Vestara workspaces.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-008)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export interface WorkspaceBinding {
  /** Binding ID */
  readonly id: string;

  /** Principal ID */
  readonly principalId: string;

  /** Workspace ID */
  readonly workspaceId: string;

  /** Workspace name */
  readonly workspaceName: string;

  /** Whether this is the preferred workspace */
  readonly preferred: boolean;

  /** ISO-8601 timestamp when binding was created */
  readonly createdAt: string;

  /** ISO-8601 timestamp when workspace was last accessed */
  readonly lastAccessedAt: string;
}

export interface WorkspaceBindingConfig {
  /** Maximum workspaces per principal */
  readonly maxWorkspacesPerPrincipal?: number;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<WorkspaceBindingConfig> = {
  maxWorkspacesPerPrincipal: 10,
};

// ─── Workspace Binding Service ─────────────────────────────────

export class TelegramWorkspaceBindingService {
  private config: Required<WorkspaceBindingConfig>;
  private bindings: Map<string, WorkspaceBinding> = new Map();

  constructor(config?: WorkspaceBindingConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Bind a principal to a workspace.
   */
  bindWorkspace(
    principalId: string,
    workspaceId: string,
    workspaceName: string,
  ): WorkspaceBinding {
    // Check if already bound
    const existing = this.getBinding(principalId, workspaceId);
    if (existing) {
      throw new Error('Principal is already bound to this workspace');
    }

    // Check workspace limit
    const principalBindings = this.getBindingsByPrincipal(principalId);
    if (principalBindings.length >= this.config.maxWorkspacesPerPrincipal) {
      throw new Error('Maximum workspaces per principal reached');
    }

    const now = new Date().toISOString();
    const isFirst = principalBindings.length === 0;

    const binding: WorkspaceBinding = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      principalId,
      workspaceId,
      workspaceName,
      preferred: isFirst, // First workspace is preferred
      createdAt: now,
      lastAccessedAt: now,
    };

    this.bindings.set(binding.id, binding);
    return binding;
  }

  /**
   * Unbind a principal from a workspace.
   */
  unbindWorkspace(principalId: string, workspaceId: string): void {
    const binding = this.getBinding(principalId, workspaceId);
    if (binding) {
      this.bindings.delete(binding.id);
    }
  }

  /**
   * Get binding for a principal and workspace.
   */
  getBinding(principalId: string, workspaceId: string): WorkspaceBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.principalId === principalId && binding.workspaceId === workspaceId) {
        return binding;
      }
    }
    return undefined;
  }

  /**
   * Get all bindings for a principal.
   */
  getBindingsByPrincipal(principalId: string): readonly WorkspaceBinding[] {
    return Array.from(this.bindings.values()).filter((b) => b.principalId === principalId);
  }

  /**
   * Get the preferred workspace for a principal.
   */
  getPreferredWorkspace(principalId: string): WorkspaceBinding | undefined {
    return this.getBindingsByPrincipal(principalId).find((b) => b.preferred);
  }

  /**
   * Set preferred workspace for a principal.
   */
  setPreferredWorkspace(principalId: string, workspaceId: string): void {
    // Clear all preferred flags for this principal
    for (const binding of this.bindings.values()) {
      if (binding.principalId === principalId && binding.preferred) {
        this.bindings.set(binding.id, { ...binding, preferred: false });
      }
    }

    // Set new preferred
    const binding = this.getBinding(principalId, workspaceId);
    if (binding) {
      this.bindings.set(binding.id, { ...binding, preferred: true });
    }
  }

  /**
   * Update last accessed timestamp.
   */
  touchWorkspace(principalId: string, workspaceId: string): void {
    const binding = this.getBinding(principalId, workspaceId);
    if (binding) {
      this.bindings.set(binding.id, {
        ...binding,
        lastAccessedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Check if a principal has access to a workspace.
   */
  hasAccess(principalId: string, workspaceId: string): boolean {
    return this.getBinding(principalId, workspaceId) !== undefined;
  }
}
