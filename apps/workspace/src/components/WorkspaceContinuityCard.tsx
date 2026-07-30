export interface ContinuityContext {
  workspaceName: string;
  lastMilestone: string;
  nextRecommended: string;
  decisionCount: number;
  lastActive: string;
}

interface Props {
  context: ContinuityContext | null;
  loading: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

export default function WorkspaceContinuityCard({ context, loading, onContinue, onDismiss }: Props) {
  if (loading) {
    return (
      <div className="mb-2 p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg
            className="w-4 h-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-label="Loading"
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Restoring workspace...
        </div>
      </div>
    );
  }

  if (!context) return null;

  return (
    <div className="mb-2 p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-5 h-5 text-(--vestara-accent)"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-label="History"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <h3 className="text-sm font-semibold text-zinc-200">Welcome Back</h3>
      </div>

      <p className="text-xs text-zinc-300 mb-2 leading-relaxed">
        Restored your <strong className="text-zinc-100">{context.workspaceName}</strong> workspace.
      </p>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        <span className="text-[9px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">
          {context.decisionCount} decisions
        </span>
        <span className="text-[9px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">
          {context.lastMilestone}
        </span>
      </div>

      <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
        Last session: {context.lastActive}. Next recommended milestone:{' '}
        <strong className="text-zinc-200">{context.nextRecommended}</strong>.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="text-[10px] px-3 py-1.5 accent-btn rounded cursor-pointer font-medium"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] px-3 py-1.5 border border-zinc-700 text-zinc-400 rounded hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
