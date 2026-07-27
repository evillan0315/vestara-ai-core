interface ChatErrorProps {
  message: string;
  onRetry?: () => void;
}

export function ChatError({ message, onRetry }: ChatErrorProps) {
  return (
    <div className="flex items-start gap-3 py-4 max-w-full">
      <div className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-red-400/90">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-[11px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
