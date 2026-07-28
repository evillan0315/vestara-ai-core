import type {
  ComparisonExpression,
  ExpressionNode,
  ExpressionValue,
  InExpression,
  LogicalExpression,
  NotExpression,
  PolicyContext,
  UnaryExpression,
} from '@vestara/policy-types';

export class ConditionEvaluator {
  evaluate(node: ExpressionNode, context: PolicyContext): boolean {
    switch (node.type) {
      case 'and':
      case 'or':
        return this.evaluateLogical(node, context);
      case 'not':
        return this.evaluateNot(node, context);
      case 'comparison':
        return this.evaluateComparison(node, context);
      case 'unary':
        return this.evaluateUnary(node, context);
      case 'in':
        return this.evaluateIn(node, context);
    }
  }

  private evaluateLogical(node: LogicalExpression, context: PolicyContext): boolean {
    if (node.type === 'and') {
      for (const condition of node.conditions) {
        if (!this.evaluate(condition, context)) return false;
      }
      return true;
    }
    for (const condition of node.conditions) {
      if (this.evaluate(condition, context)) return true;
    }
    return false;
  }

  private evaluateNot(node: NotExpression, context: PolicyContext): boolean {
    return !this.evaluate(node.condition, context);
  }

  private evaluateComparison(node: ComparisonExpression, context: PolicyContext): boolean {
    const actual = resolveField(node.field, context);
    if (actual === undefined) return false;

    switch (node.operator) {
      case 'eq':
        return actual === node.value;
      case 'neq':
        return actual !== node.value;
      case 'gt':
        return typeof actual === 'number' && typeof node.value === 'number' && actual > node.value;
      case 'gte':
        return typeof actual === 'number' && typeof node.value === 'number' && actual >= node.value;
      case 'lt':
        return typeof actual === 'number' && typeof node.value === 'number' && actual < node.value;
      case 'lte':
        return typeof actual === 'number' && typeof node.value === 'number' && actual <= node.value;
      case 'contains':
        if (typeof actual === 'string' && typeof node.value === 'string') {
          return actual.includes(node.value);
        }
        return false;
      case 'matches':
        if (typeof actual === 'string' && typeof node.value === 'string') {
          try {
            return new RegExp(node.value).test(actual);
          } catch {
            return false;
          }
        }
        return false;
      case 'startsWith':
        if (typeof actual === 'string' && typeof node.value === 'string') {
          return actual.startsWith(node.value);
        }
        return false;
      case 'endsWith':
        if (typeof actual === 'string' && typeof node.value === 'string') {
          return actual.endsWith(node.value);
        }
        return false;
    }
  }

  private evaluateUnary(node: UnaryExpression, context: PolicyContext): boolean {
    const exists = this.fieldExists(node.field, context);
    return node.operator === 'exists' ? exists : !exists;
  }

  private fieldExists(field: string, context: PolicyContext): boolean {
    const parts = field.split('.');
    let current: unknown = context;
    for (const part of parts) {
      if (current === null || current === undefined) return false;
      if (typeof current !== 'object') return false;
      current = (current as Record<string, unknown>)[part];
    }
    return current !== undefined;
  }

  private evaluateIn(node: InExpression, context: PolicyContext): boolean {
    const actual = resolveField(node.field, context);
    if (actual === undefined) return node.negate;
    const matched = node.values.some((v) => v === actual);
    return node.negate ? !matched : matched;
  }
}

function resolveField(field: string, context: PolicyContext): ExpressionValue | undefined {
  const parts = field.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  if (
    current === null ||
    current === undefined ||
    typeof current === 'string' ||
    typeof current === 'number' ||
    typeof current === 'boolean'
  ) {
    return current as ExpressionValue;
  }

  return undefined;
}
