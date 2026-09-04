import type { UnderstandingData } from './useUnderstanding';

export function IdentityCard({ data }: { data: UnderstandingData }) {
  const archLabel =
    data.architecture.kind === 'monorepo'
      ? 'Monorepo'
      : data.architecture.kind === 'multi-module'
        ? 'Multi-Module'
        : 'Project';

  const healthColor =
    data.maturity.healthScore >= 7
      ? 'text-[var(--vestara-green)]'
      : data.maturity.healthScore >= 4
        ? 'text-[var(--vestara-amber)]'
        : 'text-[var(--vestara-red)]';

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-accent)] rounded-lg p-5 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h2 className="text-sm font-semibold text-[var(--vestara-text)] mb-3">{data.identity.name}</h2>
      <div className="space-y-1.5 text-sm text-[var(--vestara-text-2)]">
        <div className="flex justify-between">
          <span>Language</span>
          <span className="font-medium text-[var(--vestara-text)] capitalize">
            {data.identity.primaryLanguage}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Architecture</span>
          <span className="font-medium text-[var(--vestara-text)]">{archLabel}</span>
        </div>
        {data.identity.framework && (
          <div className="flex justify-between">
            <span>Framework</span>
            <span className="font-medium text-[var(--vestara-text)]">{data.identity.framework}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Packages</span>
          <span className="font-medium text-[var(--vestara-text)]">
            {data.architecture.entryPoints.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Health</span>
          <span className={`font-medium ${healthColor}`}>
            {data.maturity.healthScore.toFixed(1)}/10
          </span>
        </div>
      </div>
    </div>
  );
}
