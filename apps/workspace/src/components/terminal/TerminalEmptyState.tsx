interface TerminalEmptyStateProps {
  onNewSession: () => void;
}

export function TerminalEmptyState({ onNewSession }: TerminalEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <div className="max-w-sm">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h2 className="text-sm font-medium text-zinc-300 mb-2">Terminal</h2>
        <p className="text-[11px] text-zinc-600 leading-relaxed mb-5">
          Start a new shell session to run commands, inspect logs, manage projects, and work with Vestara AI agents.
        </p>

        <button
          onClick={onNewSession}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-700 hover:text-zinc-100 transition-all text-[12px] cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Terminal
        </button>
      </div>
    </div>
  );
}
