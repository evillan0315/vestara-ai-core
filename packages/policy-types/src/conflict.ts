import type { CompositionStrategy } from './composition';
import type { PolicyDecision } from './decision';

export interface ConflictInput {
  readonly decisions: readonly PolicyDecision[];
  readonly strategy: CompositionStrategy;
}

export interface ConflictResolver {
  resolve(input: ConflictInput): PolicyDecision;
}
