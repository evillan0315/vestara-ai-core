import { VestaraMark } from '../branding/VestaraMark';

interface TerminalEmptyStateProps {
  onNewSession: () => void;
}

export function TerminalEmptyState({ onNewSession }: TerminalEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex justify-center" aria-hidden="true">
          <VestaraMark size={44} />
        </div>

        <h2 className="text-sm font-medium text-(--vestara-text) mb-2">Terminal</h2>
        <p className="text-[11px] text-(--vestara-text-muted) leading-relaxed mb-5">
          Start a new shell session to run commands, inspect logs, manage projects, and work with Vestara AI agents.
        </p>

        <button
          onClick={onNewSession}
          className="inline-flex items-center gap-2 px-4 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) rounded-lg hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-all text-[12px] cursor-pointer"
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
