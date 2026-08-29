import type { LiveEvent } from '../../lib/useEventStream';
import { VestaraModal } from '../ui/VestaraModal';

interface OpsEventModalProps {
  event: LiveEvent;
  onClose: () => void;
}

export default function OpsEventModal({ event, onClose }: OpsEventModalProps) {
  return (
    <VestaraModal onClose={onClose} className="max-w-4xl max-h-[80vh] flex flex-col">
      <div className="flex flex-col flex-1 min-h-0 p-5">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-sm font-semibold text-(--vestara-text)">Event Details</h3>
          <button
            onClick={onClose}
            className="text-(--vestara-text-muted) hover:text-(--vestara-text-2) text-base cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 flex-1 min-h-0 pr-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-(--vestara-text-muted) text-[10px]">Type</span>
              <div className="text-(--vestara-text) font-mono text-[11px] mt-0.5">{event.type}</div>
            </div>
            <div>
              <span className="text-(--vestara-text-muted) text-[10px]">Actor</span>
              <div className="text-(--vestara-text) text-[11px] mt-0.5">
                {event.actor?.name} ({event.actor?.type})
              </div>
            </div>
            <div>
              <span className="text-(--vestara-text-muted) text-[10px]">Time</span>
              <div className="text-(--vestara-text) text-[11px] mt-0.5">
                {new Date(event.timestamp).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-(--vestara-text-muted) text-[10px]">Category</span>
              <div className="text-(--vestara-text) text-[11px] mt-0.5">{event.category}</div>
            </div>
          </div>
          <div className="pt-2 border-t border-(--vestara-accent-border)">
            <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
              Message
            </div>
            <div className="text-xs text-(--vestara-text) leading-relaxed bg-(--vestara-accent-bg) border border-(--vestara-accent-border)/50 rounded-lg p-3">
              {event.message}
            </div>
          </div>
          {event.metadata && (
            <div className="pt-2 border-t border-(--vestara-accent-border)">
              <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                Metadata
              </div>
              <pre
                className="text-[10px] text-(--vestara-text-2) font-mono whitespace-pre-wrap bg-(--vestara-accent-bg) border border-(--vestara-accent-border)/50 rounded-lg p-3 max-h-48"
                style={{ overflowY: 'scroll' }}
              >
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </VestaraModal>
  );
}
