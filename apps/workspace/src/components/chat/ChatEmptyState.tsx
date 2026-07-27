import { useState } from 'react';
import { SUGGESTED_PROMPTS } from './utils';

const PROMPT_ICONS: Record<string, string> = {
  'Build a React dashboard with authentication': 'dashboard',
  'Analyze my project architecture': 'analyze',
  'Explain this error and how to fix it': 'debug',
  'Create an API endpoint pattern': 'api',
  'Review this code for improvements': 'review',
  'Design a database schema': 'database',
};

interface ChatEmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

function SuggestionCard({ prompt, onClick }: { prompt: string; onClick: () => void }) {
  const [sent, setSent] = useState(false);
  const iconType = PROMPT_ICONS[prompt] || 'default';

  return (
    <button
      onClick={() => {
        setSent(true);
        onClick();
      }}
      disabled={sent}
      className={`group relative text-left px-3.5 py-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${
        sent
          ? 'bg-zinc-800/30 border-zinc-700/30 text-zinc-600'
          : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300 hover:border-zinc-700/60'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <PromptIcon name={iconType} sent={sent} />
        <div className="flex-1 min-w-0 text-left">
          <span className={`text-[12px] leading-snug ${sent ? 'text-zinc-600' : ''}`}>{prompt}</span>
        </div>
        {sent ? (
          <svg
            className="w-3.5 h-3.5 text-green-500/60 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-500 transition-colors shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
          </svg>
        )}
      </div>
    </button>
  );
}

function PromptIcon({ name, sent }: { name: string; sent: boolean }) {
  const cls = sent ? 'text-zinc-600' : 'text-zinc-600 group-hover:text-amber-400/80';
  switch (name) {
    case 'dashboard':
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
          />
        </svg>
      );
    case 'analyze':
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );
    case 'debug':
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'api':
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case 'review':
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      );
    case 'database':
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
          />
        </svg>
      );
    default:
      return (
        <svg
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${cls}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
  }
}

export function ChatEmptyState({ onSuggestionClick }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/5 border border-amber-500/10 flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-zinc-100 mb-2">Vestara AI</h1>
        <p className="text-sm text-zinc-500 mb-8">Ask anything, build anything, and work with AI.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
          {SUGGESTED_PROMPTS.slice(0, 6).map((prompt) => (
            <SuggestionCard key={prompt} prompt={prompt} onClick={() => onSuggestionClick(prompt)} />
          ))}
        </div>

        <div className="text-[10px] text-zinc-700 leading-relaxed space-y-1">
          <p>
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">
              Enter
            </kbd>{' '}
            to send ·{' '}
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">
              Shift+Enter
            </kbd>{' '}
            for new line
          </p>
          <p>
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">
              Ctrl+K
            </kbd>{' '}
            search ·{' '}
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-500">
              Ctrl+N
            </kbd>{' '}
            new chat
          </p>
        </div>
      </div>
    </div>
  );
}
