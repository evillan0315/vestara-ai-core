import type { DecisionContext, ExecutionResult } from '../context';
import type { StageRunner } from '../stages';

export interface ExecutionAdapter {
  execute(input: {
    requestId: string;
    operation: string;
    actor: string;
    targetType: string;
    targetId: string;
  }): Promise<ExecutionResult> | ExecutionResult;
}

/**
 * Stage runner for the Execution stage. Composes any executor (scheduler,
 * worker, orchestrator) behind a thin adapter.
 */
export function executionStage(adapter: ExecutionAdapter): StageRunner {
  return {
    stage: 'execution',
    run: async (context: DecisionContext) => ({
      field: 'executionResult',
      value: await adapter.execute({
        requestId: context.request.id,
        operation: context.request.operation,
        actor: context.principal.id,
        targetType: context.request.targetType,
        targetId: context.request.targetId,
      }),
    }),
  };
}
