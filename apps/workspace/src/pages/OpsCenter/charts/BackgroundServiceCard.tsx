interface BackgroundServiceCardProps {
  bgRunning: boolean;
  bgObservations: number;
  onRunBackground: () => void;
}

export function BackgroundServiceCard({ bgRunning, bgObservations, onRunBackground }: BackgroundServiceCardProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Background Services</h3>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-(--vestara-text-2)">Observations</span>
        <span className="text-lg font-bold text-(--vestara-text)">{bgObservations}</span>
      </div>
      <button onClick={onRunBackground} disabled={bgRunning}
        className="w-full text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors disabled:opacity-50 cursor-pointer">
        {bgRunning ? 'Running...' : 'Run Background Analysis'}
      </button>
    </div>
  );
}
