import type { DecisionContext, HistoryRecord } from './context';
import { HistoryRecorder } from './history';
import { STAGE_ORDER, StageError, type StageResult, type StageRunner } from './stages';

export interface PipelineRunOptions {
  readonly requireHistory?: boolean;
}

export interface PipelineOutcome {
  readonly context: DecisionContext;
  readonly history?: HistoryRecord;
  readonly errored: boolean;
  readonly error?: string;
}

const CONTEXT_FIELDS: readonly string[] = [
  'request',
  'principal',
  'permissionResult',
  'policyDecision',
  'executionResult',
  'verificationResult',
  'trustRecord',
  'historyRecord',
];

export class DecisionPipeline {
  private readonly _stages: Map<string, StageRunner> = new Map();
  private readonly _history: HistoryRecorder;
  private readonly _requirePermission: boolean;

  constructor(runners: StageRunner[] = [], options?: { requirePermission?: boolean }) {
    this._history = new HistoryRecorder();
    this._requirePermission = options?.requirePermission ?? true;
    for (const runner of runners) {
      this._stages.set(runner.stage, runner);
    }
  }

  register(runner: StageRunner): void {
    this._stages.set(runner.stage, runner);
  }

  hasStage(stage: string): boolean {
    return this._stages.has(stage);
  }

  get history(): HistoryRecorder {
    return this._history;
  }

  async run(request: DecisionContext['request'], principal: DecisionContext['principal']): Promise<PipelineOutcome> {
    let context: DecisionContext = { request, principal };

    for (const stage of STAGE_ORDER) {
      const runner = this._stages.get(stage);
      if (!runner) continue;

      try {
        const result = await runner.run(context);
        context = this.apply(context, stage, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          context,
          errored: true,
          error: message,
          history: this._history.recordFailure(request.id, message),
        };
      }

      if (stage === 'permission') {
        const permission = context.permissionResult;
        if (this._requirePermission && permission && !permission.allowed) {
          return {
            context,
            errored: false,
            error: permission.reason,
            history: this._history.record(context),
          };
        }
      }
    }

    const history = this._history.record(context);
    return {
      context: { ...context, historyRecord: history },
      history,
      errored: false,
    };
  }

  private apply(context: DecisionContext, stage: string, result: StageResult): DecisionContext {
    const field = String(result.field);
    if (!CONTEXT_FIELDS.includes(field)) {
      throw new StageError(stage as never, `Unknown context field "${field}"`);
    }
    if ((context as unknown as Record<string, unknown>)[field] !== undefined) {
      throw new StageError(stage as never, `Context field "${field}" is already populated`);
    }
    return {
      ...context,
      [result.field]: result.value,
    } as DecisionContext;
  }
}
