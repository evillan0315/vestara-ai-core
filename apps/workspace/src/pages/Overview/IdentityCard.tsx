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
      ? 'text-[--vestara-green]'
      : data.maturity.healthScore >= 4
        ? 'text-amber-500'
        : 'text-(--vestara-red)';

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-5">
      <h2 className="text-lg font-semibold text-(--vestara-text)">{data.identity.name}</h2>
      <div className="mt-3 space-y-1.5 text-sm text-(--vestara-text-2)">
        <div className="flex justify-between">
          <span>Language</span>
          <span className="font-medium text-(--vestara-text) capitalize">{data.identity.primaryLanguage}</span>
        </div>
        <div className="flex justify-between">
          <span>Architecture</span>
          <span className="font-medium text-(--vestara-text)">{archLabel}</span>
        </div>
        {data.identity.framework && (
          <div className="flex justify-between">
            <span>Framework</span>
            <span className="font-medium text-(--vestara-text)">{data.identity.framework}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Package Count</span>
          <span className="font-medium text-(--vestara-text)">{data.architecture.entryPoints.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Health</span>
          <span className={`font-medium ${healthColor}`}>{data.maturity.healthScore.toFixed(1)}/10</span>
        </div>
      </div>
    </div>
  );
}
