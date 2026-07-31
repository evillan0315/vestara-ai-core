/**
 * Ask AI panel.
 *
 * Grounded Q&A over the current document, a text selection, or the entire
 * documentation index. Answers render through the same markdown pipeline
 * used for documents.
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useEffect, useRef, useState } from 'react';
import type { DocContent } from '../../lib/docs';
import { askAboutDoc } from '../../lib/docs';
import { DocMarkdown } from './DocMarkdown';

type Scope = 'document' | 'selection' | 'entire-docs';

interface AskAiProps {
  open: boolean;
  onClose: () => void;
  doc: DocContent | null;
  selection: string | null;
  onNavigate: (path: string) => void;
}

const PRESETS: Array<{ label: string; scope: Scope; question: string }> = [
  { label: 'Summarize', scope: 'document', question: 'Summarize this document in a few sentences.' },
  { label: 'Key points', scope: 'document', question: 'What are the most important points and takeaways?' },
  { label: 'Architecture', scope: 'document', question: 'Explain the architecture and how the pieces fit together.' },
  { label: 'Next steps', scope: 'document', question: 'What should someone do next after reading this?' },
  { label: 'About selection', scope: 'selection', question: 'Explain the selected text in context.' },
  { label: 'Whole docs', scope: 'entire-docs', question: 'Summarize what the documentation covers overall.' },
];

export function AskAi({ open, onClose, doc, selection, onNavigate }: AskAiProps) {
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<Scope>('document');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setAnswer('');
      setError(null);
      setLoading(false);
      setQuestion('');
    } else if (selection) {
      setScope('selection');
    }
  }, [open, selection]);

  useEffect(() => {
    if (open && answer) scrollRef.current?.scrollTo({ top: 0 });
  }, [open, answer]);

  if (!open) return null;

  const ask = async (q: string, s: Scope) => {
    const questionText = q.trim();
    if (!questionText || !doc) return;
    setLoading(true);
    setError(null);
    setAnswer('');
    const payload =
      s === 'entire-docs'
        ? { question: questionText, scope: s }
        : s === 'selection'
          ? { question: questionText, scope: s, title: doc.name, content: selection ?? doc.content }
          : { question: questionText, scope: s, title: doc.name, content: doc.content };
    const result = await askAboutDoc(payload);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAnswer(result?.answer ?? 'No response.');
  };

  return (
    <div className="doc-askai" role="dialog" aria-label="Ask AI about documentation">
      <div className="doc-askai-header">
        <div className="flex items-center gap-1.5">
          <AutoAwesomeRoundedIcon fontSize="inherit" className="text-(--vestara-accent)" />
          <span className="doc-panel-title">Ask AI</span>
        </div>
        <button type="button" className="doc-icon-btn" onClick={onClose} aria-label="Close ask AI panel">
          <CloseRoundedIcon fontSize="inherit" />
        </button>
      </div>

      <div className="doc-askai-presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="doc-tag doc-askai-preset"
            onClick={() => {
              setQuestion(p.question);
              setScope(p.scope);
              void ask(p.question, p.scope);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="doc-askai-scope" role="radiogroup" aria-label="Ask scope">
        {(
          [
            ['document', 'This document'],
            ['selection', 'Selected text'],
            ['entire-docs', 'Entire docs'],
          ] as Array<[Scope, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={scope === id}
            className={`doc-explorer-tab ${scope === id ? 'doc-explorer-tab-active' : ''}`}
            onClick={() => setScope(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="doc-askai-input">
        <textarea
          className="doc-askai-textarea"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            scope === 'selection'
              ? 'Ask about the selected text…'
              : scope === 'entire-docs'
                ? 'Ask about the whole documentation set…'
                : 'Ask about this document…'
          }
          rows={3}
          aria-label="Question"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask(question, scope);
          }}
        />
        <button
          type="button"
          className="doc-askai-submit"
          disabled={loading || !question.trim() || !doc}
          onClick={() => void ask(question, scope)}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      <div className="doc-askai-scroll" ref={scrollRef}>
        {error && <p className="doc-empty-hint text-red-400">{error}</p>}
        {loading && <p className="doc-empty-hint animate-pulse">Consulting the documentation…</p>}
        {answer && !loading && (
          <div className="doc-askai-answer">
            {doc ? (
              <DocMarkdown content={answer} currentPath={doc.path} onNavigate={onNavigate} />
            ) : (
              <p className="doc-empty-hint">Open a document to ask about it.</p>
            )}
          </div>
        )}
        {!answer && !loading && !error && (
          <p className="doc-empty-hint">
            Ask a question about this document, the selected text, or the entire documentation set.
          </p>
        )}
      </div>
    </div>
  );
}
