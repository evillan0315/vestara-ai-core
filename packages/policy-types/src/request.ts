import type { PolicyContext } from './context';
import type { PolicyDefinition } from './definition';

export interface PolicyEvaluationRequest {
  readonly context: PolicyContext;
  readonly policies: readonly PolicyDefinition[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
