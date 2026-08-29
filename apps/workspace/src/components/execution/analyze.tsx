/**
 * AI execution analysis panel.
 */

import { useState } from 'react';
import { executionApi } from '../../lib/execution';
import { DocMarkdown } from '../docs/DocMarkdown';
import { useExecution } from './ExecutionContext';

interface AiAnalyzeProps {
  open: boolean;
  onClose: () => void;
}

const PRESETS = [
  { label: 'Explain execution', question: 'Explain the current state of AI execution in this workspace.' },
  { label: 'Failures', question: 'Explain any failed or blocked executions and what likely caused them.' },
  { label: 'Bottlenecks', question: 'Analyze bottlenecks: retries, approvals, slow agents, idle workers.' },
  { label: 'Progress', question: 'Summarize project and plan progress into a concise status report.' },
  { label: 'Recommendations', question: 'Suggest concrete improvements to the execution pipeline.' },
];

export function ExecutionAnalyze({ open, onClose }: AiAnalyzeProps) {
  const { dashboard } = useExecution();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const run = async (q: string) => {
    if (!dashboard) return;
    setLoading(true);
    setError(null);
    setAnswer('');
    const snapshot = {
      metrics: dashboard.metrics,
      queueSummary: dashboard.queueSummary,
      approvals: dashboard.approvals,
      sessions: dashboard.sessions.map((s) => ({
        id: s.id,
        goal: s.goal,
        status: s.status,
        steps: s.timeline?.length,
        approvals: s.approvals?.length,
      })),
      agents: dashboard.agents.map((a) => ({
        id: a.id,
        status: a.status,
        task: a.currentTask,
        op: a.currentOperation,
      })),
      executions: dashboard.executions
        .slice(0, 100)
        .map((e) => ({ id: e.id, agentId: e.agentId, status: e.status, task: e.task })),
    };
    const result = await executionApi.analyze(snapshot, q);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAnswer(result?.answer ?? 'No response.');
  };

  return (
    <div className="exec-modal" role="dialog" aria-label="AI execution analysis">
      <div className="exec-analyze-panel">
        <div className="exec-drawer-header">
          <span className="text-[13px] font-semibold text-zinc-100">AI Execution Analysis</span>
          <button type="button" className="exec-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="exec-chip"
              onClick={() => {
                setQuestion(p.question);
                void run(p.question);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <textarea
            className="exec-input w-full min-h-[64px] resize-y p-2"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about executions, agents, approvals, failures…"
            aria-label="Execution analysis question"
          />
          <button
            type="button"
            className="exec-btn exec-btn-primary self-end"
            disabled={loading || !question.trim() || !dashboard}
            onClick={() => void run(question)}
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {error && <p className="text-[12px] text-(--vestara-red)">{error}</p>}
          {loading && <p className="exec-empty animate-pulse">Analyzing execution state…</p>}
          {answer && !loading && (
            <div className="exec-answer">
              <DocMarkdown content={answer} currentPath="execution" onNavigate={() => {}} />
            </div>
          )}
          {!answer && !loading && !error && (
            <p className="exec-empty">Run a preset or ask your own question about the execution pipeline.</p>
          )}
        </div>
      </div>
    </div>
  );
}
