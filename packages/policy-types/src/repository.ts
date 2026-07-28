import type { PolicyDefinition } from './definition';
import type { PolicyScopeQuery } from './scope';

export interface PolicySearchCriteria {
  ids?: readonly string[];
  scopes?: readonly PolicyScopeQuery[];
  enabled?: boolean;
  tags?: readonly string[];
}

export interface PolicyRepository {
  get(id: string): Promise<PolicyDefinition | null>;
  list(scope?: PolicyScopeQuery): Promise<readonly PolicyDefinition[]>;
  find(criteria: PolicySearchCriteria): Promise<readonly PolicyDefinition[]>;
}
