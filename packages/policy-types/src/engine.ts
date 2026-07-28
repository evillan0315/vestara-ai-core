import type { PolicyDecision } from './decision';
import type { PolicyEvaluationRequest } from './request';

export interface PolicyEngine {
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;
}
