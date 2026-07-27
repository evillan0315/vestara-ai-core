/**
 * @vestara/permission — Permission Engine
 *
 * Execution authorization for actions. Not authentication — this
 * engine decides whether an action is authorized to execute based
 * on tool permissions, user role, and context.
 *
 * Architecture Traceability:
 *   Foundation: TOOL-CATALOG.md → Permission Levels
 *   Specification: AI-CON-005 → Tool Security
 */

import type { ActionRequest, ToolDefinition } from '@vestara/shared';

export interface PermissionDecision {
  authorized: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

export interface PermissionEngine {
  checkPermission(
    tool: ToolDefinition,
    request: ActionRequest,
    context?: PermissionContext,
  ): Promise<PermissionDecision>;
  grantConfirmation(executionId: string): Promise<void>;
}

export interface PermissionContext {
  userId?: string;
  role?: 'admin' | 'editor' | 'user' | 'agent';
  workspaceId?: string;
  projectId?: string;
}

interface PendingConfirmation {
  executionId: string;
  toolId: string;
  decision: PermissionDecision;
  expiresAt: number;
}

export class DefaultPermissionEngine implements PermissionEngine {
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();

  async checkPermission(
    tool: ToolDefinition,
    _request: ActionRequest,
    context?: PermissionContext,
  ): Promise<PermissionDecision> {
    const role = context?.role ?? 'user';

    // Admin-only tools require admin role
    if (tool.permissions === 'admin-only' && role !== 'admin') {
      return {
        authorized: false,
        reason: `Tool "${tool.id}" requires admin privileges`,
        requiresConfirmation: false,
      };
    }

    // Read-only tools are always authorized
    if (tool.permissions === 'read-only') {
      return {
        authorized: true,
        requiresConfirmation: false,
      };
    }

    // Destructive tools always require explicit confirmation
    if (tool.destructive) {
      return {
        authorized: true,
        requiresConfirmation: true,
        confirmationMessage: `This action is destructive: ${tool.description}. Are you sure?`,
      };
    }

    // User-confirm tools require confirmation
    if (tool.permissions === 'user-confirm') {
      return {
        authorized: true,
        requiresConfirmation: true,
        confirmationMessage: `Allow "${tool.name}" to execute?`,
      };
    }

    return {
      authorized: true,
      requiresConfirmation: false,
    };
  }

  async grantConfirmation(executionId: string): Promise<void> {
    // In-memory confirmation store — future: persistent + timeout
    this.pendingConfirmations.set(executionId, {
      executionId,
      toolId: '',
      decision: { authorized: true, requiresConfirmation: false },
      expiresAt: Date.now() + 30000, // 30s timeout
    });
  }

  isConfirmed(executionId: string): boolean {
    const pending = this.pendingConfirmations.get(executionId);
    if (!pending) return false;
    if (Date.now() > pending.expiresAt) {
      this.pendingConfirmations.delete(executionId);
      return false;
    }
    return true;
  }
}
