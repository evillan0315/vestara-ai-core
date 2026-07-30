function PipelineIcon({ stage }: { stage: string }) {
  const icons: Record<string, string> = { Input: '🎤', Analyze: '🔍', Plan: '📋', Implement: '⚡', Verify: '✓', Release: '📦' };
  return <span className="text-xs">{icons[stage] || '○'}</span>;
}

interface PipelinePanelProps {
  stages: Array<{ stage: string; status: boolean; agents: number }>;
}

export default function PipelinePanel({ stages }: PipelinePanelProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Pipeline</h3>
      <div className="relative">
        {stages.map((stage: any, i: number) => (
          <div key={stage.stage} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {i < stages.length - 1 && <div className="absolute left-[11px] top-5 bottom-0 w-px bg-(--vestara-accent-border)" />}
            <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${stage.status ? 'bg-(--vestara-accent) text-white' : 'bg-(--vestara-accent-bg) text-(--vestara-text-2)'}`}>
              <PipelineIcon stage={stage.stage} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className={`text-[11px] font-medium ${stage.status ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'}`}>{stage.stage}</div>
              <div className="text-[9px] text-(--vestara-text-dim)">{stage.agents} agent{stage.agents !== 1 ? 's' : ''}</div>
            </div>
            {stage.status && <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-green) animate-pulse mt-1.5" />}
          </div>
        ))}
      </div>
    </div>
  );
}
