interface OpenCodeAbortDialogProps {
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function OpenCodeAbortDialog({ pending, error, onConfirm, onCancel }: OpenCodeAbortDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Abort session"
    >
      <div className="w-full max-w-sm mx-4 p-4 bg-zinc-900 border border-(--vestara-accent-border) rounded-lg">
        <h3 className="text-[13px] font-bold text-(--vestara-text)">Abort OpenCode session?</h3>
        <p className="text-[11px] text-(--vestara-text-muted) mt-2">
          The current operation will be stopped. Changes already made may remain in the workspace and will still require
          review.
        </p>
        {error && <p className="text-[10px] text-(--vestara-red) mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-[10px] px-2.5 py-1.5 rounded-md border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer disabled:opacity-40"
          >
            Continue Running
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="text-[10px] px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:text-amber-300 cursor-pointer disabled:opacity-40"
          >
            {pending ? 'Aborting…' : 'Abort Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
