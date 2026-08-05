// Session binding registry — maps OpenCode session IDs to Vestara sessions,
// workspaces, and owners. OpenCode session IDs are not sufficient authorization
// on their own; every request goes through ownership checks against this
// registry.

import { permissionDeniedError, sessionNotFoundError } from '../client/opencode-errors';
import type { OpenCodeSessionBinding } from '../client/opencode-types';

export interface SessionRegistry {
  bind(binding: Omit<OpenCodeSessionBinding, 'createdAt' | 'status'>): OpenCodeSessionBinding;
  get(openCodeSessionId: string): OpenCodeSessionBinding | undefined;
  findByVestaraSession(vestaraSessionId: string): OpenCodeSessionBinding[];
  updateStatus(openCodeSessionId: string, status: OpenCodeSessionBinding['status']): void;
  correlateExecution(openCodeSessionId: string, executionId: string): void;
  findByExecution(executionId: string): OpenCodeSessionBinding | undefined;
  remove(openCodeSessionId: string): void;
  count(): number;
}

export class InMemorySessionRegistry implements SessionRegistry {
  private readonly bindings = new Map<string, OpenCodeSessionBinding>();
  private readonly byExecution = new Map<string, string>();

  bind(binding: Omit<OpenCodeSessionBinding, 'createdAt' | 'status'>): OpenCodeSessionBinding {
    const full: OpenCodeSessionBinding = {
      ...binding,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    this.bindings.set(binding.openCodeSessionId, full);
    if (binding.executionId) this.byExecution.set(binding.executionId, binding.openCodeSessionId);
    return full;
  }

  get(openCodeSessionId: string): OpenCodeSessionBinding | undefined {
    return this.bindings.get(openCodeSessionId);
  }

  findByVestaraSession(vestaraSessionId: string): OpenCodeSessionBinding[] {
    return [...this.bindings.values()].filter((binding) => binding.vestaraSessionId === vestaraSessionId);
  }

  updateStatus(openCodeSessionId: string, status: OpenCodeSessionBinding['status']): void {
    const binding = this.bindings.get(openCodeSessionId);
    if (binding) this.bindings.set(openCodeSessionId, { ...binding, status });
  }

  correlateExecution(openCodeSessionId: string, executionId: string): void {
    const binding = this.bindings.get(openCodeSessionId);
    if (!binding) return;
    this.byExecution.set(executionId, openCodeSessionId);
    this.bindings.set(openCodeSessionId, { ...binding, executionId });
  }

  findByExecution(executionId: string): OpenCodeSessionBinding | undefined {
    const openCodeSessionId = this.byExecution.get(executionId);
    if (!openCodeSessionId) return undefined;
    return this.bindings.get(openCodeSessionId);
  }

  remove(openCodeSessionId: string): void {
    const binding = this.bindings.get(openCodeSessionId);
    if (binding?.executionId) this.byExecution.delete(binding.executionId);
    this.bindings.delete(openCodeSessionId);
  }

  count(): number {
    return this.bindings.size;
  }
}

export interface OwnershipContext {
  readonly workspaceId: string;
  readonly userId?: string;
}

export interface OwnershipResult {
  readonly ok: boolean;
  readonly error?: ReturnType<typeof permissionDeniedError> | ReturnType<typeof sessionNotFoundError>;
}

/**
 * Require an active binding whose workspace matches the caller's workspace.
 * The caller (user/agent) may also be checked when provided.
 */
export function requireSessionOwnership(
  registry: SessionRegistry,
  openCodeSessionId: string,
  context: OwnershipContext,
): OwnershipResult {
  const binding = registry.get(openCodeSessionId);
  if (!binding) {
    return { ok: false, error: sessionNotFoundError(openCodeSessionId) };
  }
  if (binding.status === 'deleted') {
    return { ok: false, error: sessionNotFoundError(openCodeSessionId) };
  }
  if (binding.workspaceId !== context.workspaceId) {
    return { ok: false, error: permissionDeniedError('Session belongs to a different workspace.') };
  }
  if (context.userId && binding.createdBy !== context.userId) {
    return { ok: false, error: permissionDeniedError('Session belongs to a different user.') };
  }
  return { ok: true };
}
