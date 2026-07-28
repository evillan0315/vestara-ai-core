import type { LiveEvent } from '../../lib/useEventStream';

interface OpsEventModalProps {
  event: LiveEvent;
  onClose: () => void;
}

export default function OpsEventModal({ event, onClose }: OpsEventModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-700)] rounded-xl p-5 w-full max-w-4xl mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-zinc-200)]">Event Details</h3>
          <button onClick={onClose} className="text-[var(--color-zinc-600)] hover:text-[var(--color-zinc-400)] text-base cursor-pointer">
            ✕
          </button>
        </div>
        <div className="space-y-3 flex-1 pr-1" style={{ overflowY: 'scroll' }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Type</span>
              <div className="text-[var(--color-zinc-300)] font-mono text-[11px] mt-0.5">{event.type}</div>
            </div>
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Actor</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">
                {event.actor?.name} ({event.actor?.type})
              </div>
            </div>
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Time</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">
                {new Date(event.timestamp).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Category</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">{event.category}</div>
            </div>
          </div>
          <div className="pt-2 border-t border-[var(--color-zinc-700)]">
            <div className="text-[9px] font-semibold text-[var(--color-zinc-500)] uppercase tracking-wider mb-1.5">Message</div>
            <div className="text-xs text-[var(--color-zinc-300)] leading-relaxed bg-[var(--color-zinc-800)]/50 border border-[var(--color-zinc-700)]/50 rounded-lg p-3">
              {event.message}
            </div>
          </div>
          {event.metadata && (
            <div className="pt-2 border-t border-[var(--color-zinc-700)]">
              <div className="text-[9px] font-semibold text-[var(--color-zinc-500)] uppercase tracking-wider mb-1.5">Metadata</div>
              <pre
                className="text-[10px] text-[var(--color-zinc-400)] font-mono whitespace-pre-wrap bg-[var(--color-zinc-800)]/50 border border-[var(--color-zinc-700)]/50 rounded-lg p-3 max-h-48"
                style={{ overflowY: 'scroll' }}
              >
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}