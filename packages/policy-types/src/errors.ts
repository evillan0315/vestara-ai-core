export class PolicyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
  }
}

export class PolicyNotFoundError extends PolicyError {
  constructor(id: string) {
    super('POLICY_NOT_FOUND', `Policy not found: ${id}`);
  }
}

export class PolicyEvaluationError extends PolicyError {
  constructor(policyId: string, reason: string) {
    super('POLICY_EVALUATION_ERROR', `Policy evaluation failed for ${policyId}: ${reason}`);
  }
}

export class InvalidConditionError extends PolicyError {
  constructor(reason: string) {
    super('INVALID_CONDITION', reason);
  }
}

export class ConflictResolutionError extends PolicyError {
  constructor(policyIds: string[], reason: string) {
    super('CONFLICT_RESOLUTION', `Conflict resolution failed for policies [${policyIds.join(', ')}]: ${reason}`);
  }
}
