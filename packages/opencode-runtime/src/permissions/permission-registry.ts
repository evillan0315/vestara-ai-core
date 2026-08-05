// Permission registry — records pending and decided OpenCode permission
// requests alongside their owning session/workspace. Decisions are recorded
// with an immutable decision field; the registry enforces workspace ownership
// when requests are listed or responded to.

import { sessionNotFoundError } from '../client/opencode-errors';
import type { OpenCodePermissionRequest, OpenCodePermissionStatus } from './permission-types';

export interface OpenCodePermissionRecord extends OpenCodePermissionRequest {
  readonly workspaceId: string;
  readonly createdBy: string;
  readonly status: OpenCodePermissionStatus;
  readonly decidedAt?: string;
  readonly decision?: 'approve' | 'reject';
  readonly decisionScope?: 'once' | 'session';
}

export interface OpenCodePermissionDecisionInput {
  readonly decision: 'approve' | 'reject';
  readonly scope?: 'once' | 'session';
  readonly reason?: string;
  readonly decidedBy: string;
}

export interface PermissionRegistry {
  record(request: OpenCodePermissionRequest, workspaceId: string, createdBy: string): OpenCodePermissionRecord;
  get(id: string): OpenCodePermissionRecord | undefined;
  listPending(workspaceId?: string): OpenCodePermissionRecord[];
  listByWorkspace(workspaceId: string): OpenCodePermissionRecord[];
  decide(id: string, input: OpenCodePermissionDecisionInput): OpenCodePermissionRecord | undefined;
  expire(id: string): void;
  count(): number;
}

export class InMemoryPermissionRegistry implements PermissionRegistry {
  private readonly records = new Map<string, OpenCodePermissionRecord>();

  record(request: OpenCodePermissionRequest, workspaceId: string, createdBy: string): OpenCodePermissionRecord {
    const record: OpenCodePermissionRecord = {
      ...request,
      workspaceId,
      createdBy,
      status: 'pending',
    };
    this.records.set(request.id, record);
    return record;
  }

  get(id: string): OpenCodePermissionRecord | undefined {
    return this.records.get(id);
  }

  listPending(workspaceId?: string): OpenCodePermissionRecord[] {
    return [...this.records.values()].filter(
      (record) => record.status === 'pending' && (!workspaceId || record.workspaceId === workspaceId),
    );
  }

  listByWorkspace(workspaceId: string): OpenCodePermissionRecord[] {
    return [...this.records.values()].filter((record) => record.workspaceId === workspaceId);
  }

  decide(id: string, input: OpenCodePermissionDecisionInput): OpenCodePermissionRecord | undefined {
    const record = this.records.get(id);
    if (!record || record.status !== 'pending') return undefined;
    const decided: OpenCodePermissionRecord = {
      ...record,
      status: input.decision === 'approve' ? 'approved' : 'rejected',
      decision: input.decision,
      decisionScope: input.scope,
      decidedAt: new Date().toISOString(),
    };
    this.records.set(id, decided);
    return decided;
  }

  expire(id: string): void {
    const record = this.records.get(id);
    if (record && record.status === 'pending') this.records.set(id, { ...record, status: 'expired' });
  }

  count(): number {
    return this.records.size;
  }
}

/** Resolve a pending permission record for a workspace or return a typed error. */
export function requirePendingPermission(
  registry: PermissionRegistry,
  permissionId: string,
  workspaceId: string,
): { record: OpenCodePermissionRecord } | { error: ReturnType<typeof sessionNotFoundError> } {
  const record = registry.get(permissionId);
  if (!record || record.workspaceId !== workspaceId || record.status !== 'pending') {
    return { error: sessionNotFoundError(permissionId) };
  }
  return { record };
}
