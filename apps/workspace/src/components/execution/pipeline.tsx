/**
 * Execution pipeline timeline + execution replay.
 *
 * Renders the fixed multi-agent orchestration pipeline as a vertical flow,
 * maps the selected execution session's timeline onto it, and provides a
 * scrubbable replay that steps through every recorded state change.
 */

import { useMemo, useState } from 'react';
import { formatTime, tone } from '../../lib/execution';
import { useExecution } from './ExecutionContext';

function toneClass(t: string): string {
  return t === 'pass'
    ? 'exec-status-pass'
    : t === 'fail'
      ? 'exec-status-fail'
      : t === 'warn'
        ? 'exec-status-warn'
        : 'exec-status-unknown';
}

const STAGE_TONE: Record<string, string> = {
  conversation: 'pass',
  'repository-analysis': 'pass',
  understanding: 'pass',
  planner: 'pass',
  architect: 'warn',
  approval: 'warn',
  developer: 'pass',
  reviewer: 'warn',
  tester: 'pass',
  verifier: 'pass',
  learning: 'pass',
  completed: 'pass',
};

export function PipelineTimeline() {
  const { dashboard, sessionDetail, selectedSession, selectSession, dashboardLoading } = useExecution();
  const [replayIdx, setReplayIdx] = useState<number>(-1);

  const pipeline = dashboard?.pipeline ?? [];
  const sessions = dashboard?.sessions ?? [];
  const agents = dashboard?.agents ?? [];

  // Map the selected session's timeline steps onto pipeline stages.
  const stepByStage = useMemo(() => {
    const map = new Map<string, string>();
    if (sessionDetail) {
      for (const step of sessionDetail.timeline) {
        const stage = pipeline.find(
          (p) => p.agents.includes(step.agentId) || p.label.toLowerCase().includes(step.agentId.toLowerCase()),
        );
        if (stage) map.set(stage.id, step.status);
      }
    }
    return map;
  }, [sessionDetail, pipeline]);

  const replaySteps = sessionDetail?.timeline ?? [];
  const currentStep = replayIdx >= 0 ? replaySteps[replayIdx] : null;

  const stageStatus = (stageId: string): string => {
    if (sessionDetail) return stepByStage.get(stageId) ?? 'waiting';
    // Fall back to live agent state.
    const stage = pipeline.find((p) => p.id === stageId);
    const live = agents.find((a) => stage?.agents.includes(a.id));
    return live && live.status !== 'idle' ? live.status : 'waiting';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="exec-card exec-card-body">
        <div className="flex items-center justify-between mb-2">
          <div className="exec-section-title">Multi-Agent Orchestration Pipeline</div>
          <span className="text-[10px] text-zinc-500">{sessions.length} execution sessions</span>
        </div>
        <ol className="exec-pipeline">
          {pipeline.map((stage, i) => {
            const status = stageStatus(stage.id);
            const t = tone(status);
            const active = t === 'pass' && status !== 'waiting' && status !== 'completed';
            const isDone = status === 'completed';
            return (
              <li key={stage.id} className={`exec-pipeline-stage ${active ? 'exec-pipeline-active' : ''}`}>
                <span className="exec-pipeline-node">
                  <span
                    className={`exec-pipeline-dot ${isDone ? 'exec-pipeline-done' : ''} ${active ? 'exec-pipeline-live' : ''}`}
                  />
                </span>
                <span className="exec-pipeline-body">
                  <span className="exec-pipeline-label">
                    {i + 1}. {stage.label}
                    <span className={`exec-status-chip ${toneClass(status === 'waiting' ? 'unknown' : t)}`}>
                      {status}
                    </span>
                  </span>
                  {stage.agents.length > 0 && <span className="exec-pipeline-agents">{stage.agents.join(' · ')}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Execution Replay</div>
        <select
          value={selectedSession ?? ''}
          onChange={(e) => selectSession(e.target.value || null)}
          className="exec-input w-full mb-3"
          aria-label="Execution session to replay"
        >
          <option value="">Select an execution session…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.goal || s.id} · {s.status}
            </option>
          ))}
        </select>

        {!sessionDetail && <p className="exec-empty">Select a session to scrub through its execution timeline.</p>}

        {sessionDetail && (
          <>
            <div className="text-[11px] text-zinc-400 mb-2">
              {sessionDetail.goal || sessionDetail.id} ·{' '}
              <span className={`exec-status-chip ${toneClass(tone(sessionDetail.status))}`}>
                {sessionDetail.status}
              </span>
            </div>
            <input
              type="range"
              min={-1}
              max={Math.max(0, replaySteps.length - 1)}
              value={replayIdx}
              onChange={(e) => setReplayIdx(Number(e.target.value))}
              className="w-full"
              aria-label="Replay position"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Start</span>
              <span>
                Step {replayIdx + 1} / {replaySteps.length}
              </span>
              <span>End</span>
            </div>

            {currentStep ? (
              <div className="exec-replay-step">
                <div className="flex items-center gap-2">
                  <span className={`exec-status-chip ${toneClass(tone(currentStep.status))}`}>
                    {currentStep.status}
                  </span>
                  <span className="text-[12px] text-zinc-100 font-medium">{currentStep.step}</span>
                  <span className="ml-auto text-[10px] text-zinc-500">{formatTime(currentStep.timestamp)}</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">agent: {currentStep.agentId}</div>
              </div>
            ) : (
              replaySteps.length > 0 && <p className="exec-empty">Drag the slider to replay each step.</p>
            )}

            {sessionDetail.approvals.length > 0 && (
              <div className="mt-3">
                <div className="exec-sub-title">Approvals</div>
                {sessionDetail.approvals.map((a) => (
                  <div
                    key={`${a.agentId}-${a.timestamp}`}
                    className="flex items-center gap-2 text-[11px] text-zinc-400 py-0.5"
                  >
                    <span className={a.approved ? 'text-(--vestara-green)' : 'text-(--vestara-red)'}>
                      {a.approved ? '✓' : '✕'}
                    </span>
                    {a.agentId} {a.reason ? `— ${a.reason}` : ''} · {formatTime(a.timestamp)}
                  </div>
                ))}
              </div>
            )}

            {sessionDetail.logs.length > 0 && (
              <div className="mt-3">
                <div className="exec-sub-title">Logs ({sessionDetail.logs.length})</div>
                <pre className="exec-logbox">{sessionDetail.logs.slice(0, 20).join('\n')}</pre>
              </div>
            )}
          </>
        )}

        {dashboardLoading && !dashboard && <p className="exec-empty animate-pulse">Loading…</p>}
      </div>
    </div>
  );
}
