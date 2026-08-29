/**
 * AI analysis panel — explain current diagnostics, summarize, suggest fixes.
 */

import { useState } from 'react';
import { diagnosticsApi } from '../../lib/diagnostics';
import { DocMarkdown } from '../docs/DocMarkdown';
import { useDiagnostics } from './DiagnosticsContext';

interface AiAnalyzeProps {
  open: boolean;
  onClose: () => void;
}

const PRESETS = [
  {
    label: 'Diagnose',
    question: 'Diagnose the current state of this development environment. What are the main problems?',
  },
  { label: 'High CPU', question: 'CPU is high. What is likely causing it and how do I fix it?' },
  { label: 'Memory', question: 'Analyze memory usage. Is there a leak or pressure risk?' },
  { label: 'Build issues', question: 'Analyze build/dependency health. What could break builds?' },
  { label: 'Agents', question: 'Analyze the AI agent runtime. Are there failures, retries, or bottlenecks?' },
  { label: 'Health', question: 'Summarize the health check results and prioritize what to fix first.' },
];

export function AiAnalyze({ open, onClose }: AiAnalyzeProps) {
  const { summary } = useDiagnostics();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const run = async (q: string) => {
    if (!summary) return;
    setLoading(true);
    setError(null);
    setAnswer('');
    const result = await diagnosticsApi.analyze(summary, q);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAnswer(result?.answer ?? 'No response.');
  };

  return (
    <div className="diag-modal" role="dialog" aria-label="AI diagnostics analysis">
      <div className="diag-analyze-panel">
        <div className="diag-drawer-header">
          <span className="text-[13px] font-semibold text-zinc-100">AI Diagnostics</span>
          <button type="button" className="diag-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="diag-chip"
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
            className="diag-input w-full min-h-[64px] resize-y p-2"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about CPU, memory, agents, build issues…"
            aria-label="Diagnostics question"
          />
          <button
            type="button"
            className="diag-btn diag-btn-primary self-end"
            disabled={loading || !question.trim() || !summary}
            onClick={() => void run(question)}
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {error && <p className="text-[12px] text-(--vestara-red)">{error}</p>}
          {loading && <p className="diag-empty animate-pulse">Analyzing the environment…</p>}
          {answer && !loading && (
            <div className="diag-answer">
              <DocMarkdown content={answer} currentPath="diagnostics" onNavigate={() => {}} />
            </div>
          )}
          {!answer && !loading && !error && (
            <p className="diag-empty">Run a preset or ask your own question about the current environment snapshot.</p>
          )}
        </div>
      </div>
    </div>
  );
}
