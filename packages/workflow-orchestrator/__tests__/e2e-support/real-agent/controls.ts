/**
 * WFO-E2E-002 model-call controls.
 *
 * Deterministic stop/pause conditions enforced by the authoritative runner, not
 * by any model's prose. WFO-001 participates only as a shadow recommendation
 * source during the initial real-agent trials.
 */

import type { RealAgentE2EProfile } from './profile';

export type RunControlStatus = 'continue' | 'stop' | 'pause';

export interface RunControlState {
  readonly modelCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd?: number;
  readonly elapsedMs: number;
  readonly planningTurns: number;
  readonly executionTurns: number;
  readonly noProgressTurns: number;
  readonly indeterminate?: boolean;
  readonly scopeViolation?: boolean;
  readonly approvalUnavailable?: boolean;
}

export interface RunControlResult {
  readonly status: RunControlStatus;
  readonly reasons: readonly string[];
}

export function evaluateRunControls(state: RunControlState, profile: RealAgentE2EProfile): RunControlResult {
  const stop: string[] = [];
  const pause: string[] = [];

  if (state.modelCalls >= profile.maximumModelCalls) stop.push('maximum model-call count reached');
  if (state.inputTokens > profile.maximumInputTokens) stop.push('maximum input tokens reached');
  if (state.outputTokens > profile.maximumOutputTokens) stop.push('maximum output tokens reached');
  if (state.estimatedCostUsd !== undefined && state.estimatedCostUsd >= profile.maximumEstimatedCostUsd) {
    pause.push('budget threshold reached — budget-paused until policy adjustment');
  }
  if (state.elapsedMs >= profile.maximumDurationMs) stop.push('maximum duration reached');
  if (state.executionTurns >= profile.maximumExecutionTurns) stop.push('maximum execution turns reached');
  if (state.scopeViolation) stop.push('scope violation attempted');
  if (state.approvalUnavailable) pause.push('required approval unavailable');

  if (state.noProgressTurns > 0) pause.push('repeated no-progress turns detected');
  if (state.indeterminate) pause.push('workflow is indeterminate');
  if (state.planningTurns >= profile.maximumPlanningTurns) {
    pause.push('planning-turn limit reached with unresolved review');
  }

  if (stop.length > 0) return { status: 'stop', reasons: stop };
  if (pause.length > 0) return { status: 'pause', reasons: pause };
  return { status: 'continue', reasons: [] };
}
