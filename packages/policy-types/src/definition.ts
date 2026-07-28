import type { PolicyAction } from './actions';
import type { ExpressionNode } from './conditions';
import type { PolicyScope } from './scope';

export interface PolicyMetadata {
  readonly author: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PolicyDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly priority: number;
  readonly scope: PolicyScope;
  readonly enabled: boolean;
  readonly conditions: ExpressionNode;
  readonly actions: readonly PolicyAction[];
  readonly metadata: PolicyMetadata;
}
