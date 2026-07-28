export type CompositionStrategy =
  | 'deny_overrides'
  | 'allow_overrides'
  | 'priority_ordered'
  | 'first_match'
  | 'most_restrictive'
  | 'merge'
  | 'consensus';

export interface CompositionStrategyConfig {
  strategy: CompositionStrategy;
  scopeDefault?: boolean;
}
