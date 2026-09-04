import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActivityCard } from './Overview/ActivityCard';
import { ArchitectureCard } from './Overview/ArchitectureCard';
import { DecisionsCard } from './Overview/DecisionsCard';
import { HealthCard } from './Overview/HealthCard';
import { IdentityCard } from './Overview/IdentityCard';
import { StateCard } from './Overview/StateCard';
import { useUnderstanding } from './Overview/useUnderstanding';
import { HealthRadialChart } from './Overview/charts/HealthRadialChart';
import { LayersBarChart } from './Overview/charts/LayersBarChart';
import { EntryPointsChart } from './Overview/charts/EntryPointsChart';

const SUMMARY_MAX_LENGTH = 200;

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-7 w-56 rounded bg-[var(--vestara-accent-bg)] animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded bg-[var(--vestara-accent-bg)] animate-pulse" />
      </div>

      {/* Quick actions skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-3 w-14 rounded bg-[var(--vestara-accent-bg)] animate-pulse" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-7 w-24 rounded-lg bg-[var(--vestara-accent-bg)] animate-pulse"
          />
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] rounded-lg p-5 space-y-3"
          >
            <div className="h-5 w-28 rounded bg-[var(--color-zinc-800)] animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-[var(--color-zinc-800)] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[var(--color-zinc-800)] animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-[var(--color-zinc-800)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--vestara-red)]/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-[var(--vestara-red)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-[var(--vestara-text)] mb-2">
          Failed to load workspace understanding
        </h3>
        <p className="text-xs text-[var(--vestara-text-muted)] mb-4">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-xs font-medium text-[var(--vestara-text)] bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] rounded-lg hover:border-[var(--vestara-accent-border-hover)] transition-colors cursor-pointer"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useUnderstanding();
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  if (!data) return null;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[var(--vestara-text)] tracking-tight">
          Workspace Overview
        </h1>
        <p className="text-sm text-[var(--vestara-text-2)] mt-1 leading-relaxed max-w-2xl">
          {summaryExpanded
            ? data.summary
            : data.summary.length > SUMMARY_MAX_LENGTH
              ? data.summary.slice(0, SUMMARY_MAX_LENGTH) + '\u2026'
              : data.summary}
        </p>
        {data.summary.length > SUMMARY_MAX_LENGTH && (
          <button
            type="button"
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="text-[10px] text-[var(--vestara-accent-text)] hover:text-[var(--vestara-accent-text-hover)] mt-1 cursor-pointer transition-colors"
          >
            {summaryExpanded ? '\u2190 Show less' : 'Show more \u2192'}
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-[9px] text-[var(--vestara-text-muted)] uppercase tracking-wider font-semibold mr-1">
          Quick
        </span>
        {[
          { label: 'Start Chat', icon: '\uD83D\uDCAC', path: '/chat' },
          { label: 'Dashboard', icon: '\uD83D\uDCCA', path: '/dashboard' },
          { label: 'Terminal', icon: '\u2328\uFE0F', path: '/terminal' },
          { label: 'Knowledge', icon: '\uD83E\uDDE0', path: '/memory' },
        ].map(({ label, icon, path }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className="text-[10px] px-3 py-1.5 bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] text-[var(--vestara-text-2)] rounded-lg hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-text)] transition-all cursor-pointer"
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <IdentityCard data={data} />
        <HealthCard data={data} />
        <StateCard data={data} />
        <ActivityCard data={data} />
        <ArchitectureCard data={data} />
        <DecisionsCard data={data} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <HealthRadialChart data={data} />
        <LayersBarChart data={data} />
      </div>
      <div className="mt-4">
        <EntryPointsChart data={data} />
      </div>

      {/* Footer */}
      <div className="mt-5 pt-3 border-t border-[var(--vestara-accent-border)] text-center">
        <span className="text-[9px] text-[var(--vestara-text-dim)]">
          Auto-refreshes every 10s &middot; {data.state?.indexFreshness || 'Up to date'}
        </span>
      </div>
    </div>
  );
}
