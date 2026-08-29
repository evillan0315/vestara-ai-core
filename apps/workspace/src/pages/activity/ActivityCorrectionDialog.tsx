import { useEffect, useMemo, useState } from 'react';
import { VestaraModal } from '../../components/ui/VestaraModal';
import type { ActivityMessageInput, ActivityRecord } from './activity-types';

interface ActivityCorrectionDialogProps {
  target: ActivityRecord;
  onClose: () => void;
  onSend: (input: ActivityMessageInput) => void;
}

/**
 * Append-only correction. The original record is never mutated: correcting
 * appends a new intervention record linked via `correctionOf`, preserving the
 * mistaken attribution in history while updating the effective interpretation.
 */
export default function ActivityCorrectionDialog({ target, onClose, onSend }: ActivityCorrectionDialogProps) {
  const [note, setNote] = useState('');
  const [originalActor, setOriginalActor] = useState('');
  const [correctActor, setCorrectActor] = useState('');
  const [sending, setSending] = useState(false);

  const localActor = useMemo(() => {
    const actor = typeof window !== 'undefined' ? window.localStorage.getItem('vestara-actor') : null;
    return actor ? { displayName: actor } : undefined;
  }, []);

  useEffect(() => {
    setOriginalActor(target.actor.displayName || target.actor.id);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  const submit = (): void => {
    const corrected = correctActor.trim();
    const content = [
      `Corrected attribution: ${originalActor} → ${corrected || 'unknown'}`,
      ...(note.trim() ? [note.trim()] : []),
    ].join('\n');
    if (content.trim().length === 0) return;
    setSending(true);
    onSend({
      content,
      targets: [{ type: 'all-agents' }],
      effect: 'intervention',
      correctionOf: target.id,
      ...(localActor ? { actor: localActor } : {}),
    });
    onClose();
  };

  return (
    <VestaraModal onClose={onClose} ariaLabel="Correct attribution" className="max-w-lg">
      <div className="space-y-3 px-6 py-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-(--vestara-text)">Correct attribution</h2>
          <span className="text-[9px] text-(--vestara-text-dim)">append-only — the original is preserved</span>
        </div>
          <div className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Original attribution</div>
            <div className="mt-0.5 text-[11px] text-(--vestara-text-2)">
              {target.actor.displayName || target.actor.id} · {target.actor.role ?? target.actor.type}
            </div>
            <div className="mt-1 text-[10px] leading-relaxed text-(--vestara-text-muted)">
              {target.kind === 'agent-message' ? target.content : target.id}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Correct attribution</span>
            <input
              value={correctActor}
              onChange={(event) => setCorrectActor(event.target.value)}
              placeholder="e.g. Reviewer"
              aria-label="Corrected actor"
              className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[11px] text-(--vestara-text) outline-none placeholder-(--vestara-text-dim) focus:border-(--vestara-accent)"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Note (optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Reason or context for the correction…"
              aria-label="Correction note"
              className="w-full resize-none rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[11px] text-(--vestara-text) outline-none placeholder-(--vestara-text-dim) focus:border-(--vestara-accent)"
            />
          </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-(--vestara-accent-border) px-3 py-1.5 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending || correctActor.trim().length === 0}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] font-medium text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            Record correction
          </button>
        </div>
      </div>
    </VestaraModal>
  );
}
