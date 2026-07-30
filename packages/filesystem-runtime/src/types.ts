export type FsOperationType = 'read' | 'write' | 'create' | 'delete' | 'rename' | 'copy' | 'list' | 'exists';
export type FsRiskLevel = 'low' | 'medium' | 'high';
export type FsApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface FsOperation {
  id: string;
  type: FsOperationType;
  path: string;
  targetPath?: string;
  size?: number;
  agentId?: string;
  reason?: string;
  createdAt: string;
  riskLevel: FsRiskLevel;
  approvalStatus?: FsApprovalStatus;
}

export interface FsResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  operation: FsOperation;
  requiresApproval: boolean;
  approvalId?: string;
}

export interface FsConfig {
  rootDir: string;
  policyEngine?: { evaluate(request: unknown): Promise<{ effect: string; reason?: string }> };
  telemetry?: { trackOp(agentId: string, status: string, operation: string, task: string, opts?: Record<string, unknown>): void };
  onPendingApproval?: (op: FsOperation) => void;
}
