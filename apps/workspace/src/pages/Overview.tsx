import { useUnderstanding } from './Overview/useUnderstanding';
import { IdentityCard } from './Overview/IdentityCard';
import { ActivityCard } from './Overview/ActivityCard';
import { HealthCard } from './Overview/HealthCard';
import { ArchitectureCard } from './Overview/ArchitectureCard';
import { DecisionsCard } from './Overview/DecisionsCard';
import { StateCard } from './Overview/StateCard';

export default function Overview() {
  const { data, loading, error } = useUnderstanding();

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--vestara-text)]">Workspace Overview</h1>
        <p className="text-sm text-[var(--vestara-text-2)] mt-1">{data.summary}</p>
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