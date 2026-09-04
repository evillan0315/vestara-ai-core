import type { UnderstandingData } from './useUnderstanding';

function barColor(score: number): string {
  if (score >= 7) return 'bg-[var(--vestara-green)]';
  if (score >= 4) return 'bg-[var(--vestara-amber)]';
  return 'bg-[var(--vestara-red)]';
}

export function HealthCard({ data }: { data: UnderstandingData }) {
  const h = data.maturity;
  const score = h.healthScore;

  const scoreColor =
    score >= 7 ? 'var(--vestara-green)' : score >= 4 ? 'var(--vestara-amber)' : 'var(--vestara-red)';

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-green)] rounded-lg p-5 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h2 className="text-sm font-semibold text-[var(--vestara-text)] mb-3">Health</h2>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl font-bold" style={{ color: scoreColor }}>
          {score.toFixed(1)}
        </div>
        <div className="text-sm text-[var(--vestara-text-2)]">
          <div className="capitalize font-medium text-[var(--vestara-text)]">{h.level}</div>
          / 10
        </div>
      </div>

      <div className="w-full h-2 bg-[var(--color-zinc-700)] rounded-full mb-4">
        <div
          className={`h-full rounded-full transition-all ${barColor(score)}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Test Coverage</span>
          <span className="font-medium text-[var(--vestara-text)] capitalize">{h.testCoverage}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Code Quality</span>
          <span className="font-medium text-[var(--vestara-text)] capitalize">{h.codeQuality}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Documentation</span>
          <span className="font-medium text-[var(--vestara-text)] capitalize">{h.documentationLevel}</span>
        </div>
      </div>

      {h.risks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-zinc-800)]">
          <div className="text-xs text-[var(--vestara-text-muted)] uppercase tracking-wide mb-1.5">
            Risks ({h.risks.length})
          </div>
          <div className="space-y-1">
            {h.risks.slice(0, 3).map((r, i) => (
              <div key={i} className="text-sm flex gap-2">
                <span
                  className={`shrink-0 font-medium ${
                    r.severity === 'high'
                      ? 'text-[var(--vestara-red)]'
                      : r.severity === 'medium'
                        ? 'text-[var(--vestara-amber)]'
                        : 'text-[var(--vestara-text-muted)]'
                  }`}
                >
                  {r.severity}
                </span>
                <span className="text-[var(--vestara-text-2)] truncate">{r.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
