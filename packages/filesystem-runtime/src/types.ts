export type FsOperationType =
  | 'read'
  | 'write'
  | 'create'
  | 'update'
  | 'delete'
  | 'rename'
  | 'copy'
  | 'list'
  | 'exists'
  | 'stat'
  | 'search'
  | 'references';
export type FsRiskLevel = 'low' | 'medium' | 'high';
export type FsApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type FsOperationStatus = 'completed' | 'failed' | 'pending' | 'rejected';

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
  dryRun?: boolean;
  observation?: FsObservation;
}

/**
 * Patch-based update instructions for `FilesystemRuntime.update`.
 * All patches are applied in order against the current file content.
 */
export interface FsPatch {
  /** Replace every occurrence of `search` with `replace`. */
  replace?: Array<{ search: string; replace: string }>;
  /** Insert `content` after the given 1-based line number. */
  insert?: Array<{ atLine: number; content: string }>;
  /** Remove lines in a 1-based, inclusive range (or a single line). */
  removeLines?: Array<{ startLine: number; endLine?: number }>;
}

export interface FsChangeSummary {
  added: number;
  removed: number;
  changed: boolean;
  beforeSize: number;
  afterSize: number;
}

export interface FsMetadata {
  path: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  modifiedAt: string;
  createdAt: string;
}

/**
 * Structured result of a filesystem operation — the feedback signal
 * returned to agents and consumed by the Understanding Runtime.
 */
export interface FsObservation {
  operation: FsOperationType;
  file: string;
  status: 'success' | 'failed' | 'pending' | 'skipped';
  changes?: FsChangeSummary;
  dryRun?: boolean;
  agentId?: string;
  reason?: string;
  error?: string;
  requiresApproval?: boolean;
  timestamp: string;
}

/** Immutable record kept in the runtime operation history. */
export interface FsOperationRecord extends FsOperation {
  status: FsOperationStatus;
  dryRun: boolean;
  completedAt: string;
  summary?: FsChangeSummary;
  error?: string;
}

export interface FsConfig {
  rootDir: string;
  policyEngine?: { evaluate(request: unknown): Promise<{ effect: string; reason?: string }> };
  telemetry?: {
    trackOp(agentId: string, status: string, operation: string, task: string, opts?: Record<string, unknown>): void;
  };
  onPendingApproval?: (op: FsOperation) => void;
  /** Invoked after every recorded operation (success or failure). */
  onOperation?: (record: FsOperationRecord) => void;
  /** When true, mutating operations validate and gate but never touch disk. */
  dryRun?: boolean;
  /** Max number of records retained in history (default 200). */
  historyLimit?: number;
  /** Exact basenames that are always denied. */
  denyList?: string[];
}
