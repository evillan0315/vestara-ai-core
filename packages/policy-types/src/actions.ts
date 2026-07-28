export type ActionType =
  | 'allow'
  | 'deny'
  | 'require_approval'
  | 'modify_priority'
  | 'modify_retry'
  | 'delay'
  | 'inject_metadata'
  | 'request_verify'
  | 'escalate'
  | 'audit_only';

export interface AllowAction {
  type: 'allow';
  config?: {
    reason?: string;
  };
}

export interface DenyAction {
  type: 'deny';
  config: {
    reason: string;
  };
}

export interface RequireApprovalAction {
  type: 'require_approval';
  config: {
    reason: string;
    approvalRole: string;
    escalationTimeoutMs?: number;
  };
}

export interface ModifyPriorityAction {
  type: 'modify_priority';
  config: {
    reason: string;
    priority: number;
  };
}

export interface ModifyRetryAction {
  type: 'modify_retry';
  config: {
    reason: string;
    maxRetries: number;
    retryDelayMs: number;
  };
}

export interface DelayAction {
  type: 'delay';
  config: {
    reason: string;
    delayMs: number;
  };
}

export interface InjectMetadataAction {
  type: 'inject_metadata';
  config: {
    reason: string;
    metadata: Record<string, unknown>;
  };
}

export interface RequestVerifyAction {
  type: 'request_verify';
  config: {
    reason: string;
    verificationLevel: string;
  };
}

export interface EscalateAction {
  type: 'escalate';
  config: {
    reason: string;
    escalationTarget: string;
  };
}

export interface AuditOnlyAction {
  type: 'audit_only';
  config?: {
    reason?: string;
  };
}

export type PolicyAction =
  | AllowAction
  | DenyAction
  | RequireApprovalAction
  | ModifyPriorityAction
  | ModifyRetryAction
  | DelayAction
  | InjectMetadataAction
  | RequestVerifyAction
  | EscalateAction
  | AuditOnlyAction;
