import { useState } from 'react';
import DashboardSection from '../DashboardSection';
import type { DragSectionProps } from '../DashboardSection';

interface AnalyzeFeatureSectionProps {
  dragSection: DragSectionProps;
}

export default function AnalyzeFeatureSection({ dragSection }: AnalyzeFeatureSectionProps) {
  const [featureInput, setFeatureInput] = useState('');
  const [featureAnalysis, setFeatureAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const analyze = async () => {
    if (!featureInput.trim()) return;
    setAnalyzing(true);
    setFeatureAnalysis(null);
    try {
      const res = await fetch('/api/analyze-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: featureInput }),
      });
      const d = await res.json();
      setFeatureAnalysis(d.analysis);
    } catch {
      // Analysis failed silently
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <DashboardSection title="Analyze Feature" icon="◎" dragSection={dragSection}>
      <div className="flex gap-2">
        <input
          value={featureInput}
          onChange={(e) => setFeatureInput(e.target.value)}
          placeholder="Describe a feature to analyze..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] px-3 py-2 text-zinc-300 placeholder-zinc-600 outline-none"
          onKeyDown={async (e) => {
            if (e.key === 'Enter') analyze();
          }}
        />
        <button
          onClick={analyze}
          disabled={analyzing || !featureInput.trim()}
          className="text-[10px] px-3 py-2 accent-btn rounded disabled:opacity-30 cursor-pointer shrink-0"
        >
          {analyzing ? '⟳' : 'Analyze'}
        </button>
      </div>
      {featureAnalysis && (
        <div className="mt-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-xs text-zinc-300 whitespace-pre-wrap font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto">
          {featureAnalysis}
          <button
            onClick={() => setFeatureAnalysis(null)}
            className="block mt-1 text-[9px] text-zinc-600 hover:text-zinc-400 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
    </DashboardSection>
  );
}
