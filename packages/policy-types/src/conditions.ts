export type ComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'matches'
  | 'startsWith'
  | 'endsWith';

export type LogicalOperator = 'and' | 'or';

export type UnaryOperator = 'exists' | 'not_exists';

export type ExpressionValue = string | number | boolean | null;

export interface ComparisonExpression {
  type: 'comparison';
  field: string;
  operator: ComparisonOperator;
  value: ExpressionValue;
}

export interface LogicalExpression {
  type: 'and' | 'or';
  conditions: ExpressionNode[];
}

export interface NotExpression {
  type: 'not';
  condition: ExpressionNode;
}

export interface UnaryExpression {
  type: 'unary';
  operator: UnaryOperator;
  field: string;
}

export interface InExpression {
  type: 'in';
  field: string;
  values: ExpressionValue[];
  negate: boolean;
}

export type ExpressionNode = ComparisonExpression | LogicalExpression | NotExpression | UnaryExpression | InExpression;
