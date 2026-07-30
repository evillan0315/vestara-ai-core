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

export default function Overview() {
  const navigate = useNavigate();
  const { data, loading, error } = useUnderstanding();
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-(--vestara-text-2)">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-(--vestara-accent) border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-(--vestara-text-2)">Building understanding...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-(--vestara-red)">
          <p className="text-sm font-medium text-(--vestara-red)">Failed to load understanding</p>
          <p className="text-xs mt-1 text-(--vestara-text-2)">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-(--vestara-text)">Workspace Overview</h1>
        <div className="mt-1">
          <p className="text-sm text-(--vestara-text-2)">
            {summaryExpanded ? data.summary : data.summary.length > SUMMARY_MAX_LENGTH ? data.summary.slice(0, SUMMARY_MAX_LENGTH) + '...' : data.summary}
          </p>
          {data.summary.length > SUMMARY_MAX_LENGTH && (
            <button onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="text-xs text-(--vestara-accent) hover:underline mt-0.5 cursor-pointer">
              {summaryExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider font-semibold mr-1">Quick</span>
        {[
          { label: '💬 Start Chat', path: '/chat' },
          { label: '📊 Dashboard', path: '/dashboard' },
          { label: '⌨️ Terminal', path: '/terminal' },
          { label: '🧠 Knowledge Graph', path: '/memory' },
        ].map(({ label, path }) => (
          <button key={path} type="button" onClick={() => navigate(path)}
            className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer">
            {label}
          </button>
        ))}
      </div>

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

      <div className="mt-4 text-[9px] text-(--vestara-text-dim) text-center">
        Data refreshes every 10s · {data.state?.indexFreshness || 'Up to date'}
      </div>
    </div>
  );
}
