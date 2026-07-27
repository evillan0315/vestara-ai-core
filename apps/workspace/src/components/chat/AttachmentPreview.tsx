import type { Attachment } from './types';

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-[11px]"
        >
          {att.type.startsWith('image/') ? (
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          )}
          <span className="text-zinc-400 truncate max-w-[120px]">{att.name}</span>
          {att.size && <span className="text-zinc-700">{(att.size / 1024).toFixed(0)}KB</span>}
          {att.progress !== undefined && att.progress < 100 && <span className="text-zinc-600">{att.progress}%</span>}
          {att.error && <span className="text-red-400">{att.error}</span>}
          <button
            onClick={() => onRemove(att.id)}
            className="text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer ml-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
