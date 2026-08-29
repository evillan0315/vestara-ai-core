import type { DecisionContext, PermissionResult } from '../context';
import type { StageRunner } from '../stages';

export interface PermissionAdapter {
  check(input: { actor: string; operation: string; targetType: string; targetId: string }): PermissionResult;
}

/**
 * Stage runner for the Permission stage. Composes an existing permission
 * implementation (e.g. @vestara/permissions PermissionManager) behind a thin
 * adapter so the pipeline has no hard dependency on a specific package.
 */
export function permissionStage(adapter: PermissionAdapter): StageRunner {
  return {
    stage: 'permission',
    run: (context: DecisionContext) => ({
      field: 'permissionResult',
      value: adapter.check({
        actor: context.principal.id,
        operation: context.request.operation,
        targetType: context.request.targetType,
        targetId: context.request.targetId,
      }),
    }),
  };
}
