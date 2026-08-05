interface OpenCodeSessionDeleteDialogProps {
  sessionTitle: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function OpenCodeSessionDeleteDialog({
  sessionTitle,
  pending,
  error,
  onConfirm,
  onCancel,
}: OpenCodeSessionDeleteDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Delete session"
    >
      <div className="w-full max-w-sm mx-4 p-4 bg-zinc-900 border border-(--vestara-accent-border) rounded-lg">
        <h3 className="text-[13px] font-bold text-(--vestara-text)">Delete session</h3>
        <p className="text-[11px] text-(--vestara-text-muted) mt-2">
          Delete <span className="text-(--vestara-text) font-medium">{sessionTitle}</span>? This removes the session
          from OpenCode.
        </p>
        {error && <p className="text-[10px] text-(--vestara-red) mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-[10px] px-2.5 py-1.5 rounded-md border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="text-[10px] px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 cursor-pointer disabled:opacity-40"
          >
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
