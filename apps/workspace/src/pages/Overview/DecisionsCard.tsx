import type { UnderstandingData } from './useUnderstanding';

export function DecisionsCard({ data }: { data: UnderstandingData }) {
  const decisions = data.memory.recentDecisions;
  const facts = data.memory.keyFacts;

  if (decisions.length === 0 && facts.length === 0) return null;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-5">
      <h2 className="text-lg font-semibold text-(--vestara-text) mb-3">Decisions & Knowledge</h2>

      {decisions.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-(--vestara-text-muted) uppercase tracking-wide mb-1.5">
            Recent Decisions
          </div>
          <div className="space-y-1.5">
            {decisions.map((d, i) => (
              <div key={i} className="text-sm">
                <div className="text-(--vestara-text) font-medium">{d.title}</div>
                <div className="text-(--vestara-text-muted) text-xs">
                  {new Date(d.timestamp).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {facts.length > 0 && (
        <div>
          <div className="text-xs text-(--vestara-text-muted) uppercase tracking-wide mb-1.5">Key Facts</div>
          <div className="space-y-1">
            {facts.map((f, i) => (
              <div key={i} className="text-sm text-(--vestara-text-2)">
                • {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
