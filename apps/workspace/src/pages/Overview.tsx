import { useState } from 'react';
import { ActivityCard } from './Overview/ActivityCard';
import { ArchitectureCard } from './Overview/ArchitectureCard';
import { DecisionsCard } from './Overview/DecisionsCard';
import { HealthCard } from './Overview/HealthCard';
import { IdentityCard } from './Overview/IdentityCard';
import { StateCard } from './Overview/StateCard';
import { useUnderstanding } from './Overview/useUnderstanding';

const SUMMARY_MAX_LENGTH = 200;

export default function Overview() {
  const { data, loading, error } = useUnderstanding();
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--vestara-text-2)]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--vestara-accent)] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm">Building understanding...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-[var(--vestara-red)]">
          <p className="text-sm font-medium">Failed to load understanding</p>
          <p className="text-xs mt-1 text-[var(--vestara-text-2)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const truncated =
    data.summary.length > SUMMARY_MAX_LENGTH
      ? data.summary.slice(0, SUMMARY_MAX_LENGTH) + '...'
      : data.summary;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--vestara-text)]">Workspace Overview</h1>
        <div className="mt-1">
          <p className="text-sm text-[var(--vestara-text-2)]">
            {summaryExpanded ? data.summary : truncated}
          </p>
          {data.summary.length > SUMMARY_MAX_LENGTH && (
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="text-xs text-[var(--vestara-accent)] hover:underline mt-0.5 cursor-pointer"
            >
              {summaryExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <IdentityCard data={data} />
        <HealthCard data={data} />
        <StateCard data={data} />
        <ActivityCard data={data} />
        <ArchitectureCard data={data} />
        <DecisionsCard data={data} />
      </div>
    </div>
  );
}
