interface ScrollToLatestProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToLatest({ visible, onClick }: ScrollToLatestProps) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-800/90 border border-zinc-700/50 rounded-full text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/90 transition-all shadow-lg backdrop-blur-sm flex items-center gap-2 cursor-pointer z-10"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      New response
    </button>
  );
}
