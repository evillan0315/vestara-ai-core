import { useState } from 'react';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

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
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] px-3 py-2 text-(--vestara-text) placeholder-zinc-600 outline-none"
          onKeyDown={async (e) => {
            if (e.key === 'Enter') analyze();
          }}
        />
        <button
          onClick={analyze}
          disabled={analyzing || !featureInput.trim()}
          className="mpg-install-btn shrink-0 cursor-pointer text-[10px] disabled:opacity-30"
        >
          {analyzing ? '⟳' : 'Analyze'}
        </button>
      </div>
      {featureAnalysis && (
        <div className="mpg-card mt-2 max-h-48 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-(--vestara-text)">
          {featureAnalysis}
          <button
            onClick={() => setFeatureAnalysis(null)}
            className="mpg-link mt-1 block cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
    </DashboardSection>
  );
}
