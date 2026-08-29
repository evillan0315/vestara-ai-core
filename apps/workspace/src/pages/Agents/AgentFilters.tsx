import { useMemo, useState } from 'react';
import type { Team } from './types';

export type SortOption = 'name-asc' | 'name-desc' | 'last-execution' | 'success-rate' | 'status';

export interface AgentFiltersState {
  search: string;
  status: string;
  team: string;
  sort: SortOption;
  capabilities: string[];
}

interface AgentFiltersProps {
  teams: Team[];
  resultCount: number;
  totalSlots: number;
  allCapabilities: string[];
  onChange: (filters: AgentFiltersState) => void;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'last-execution', label: 'Last Execution' },
  { value: 'success-rate', label: 'Success Rate' },
  { value: 'status', label: 'Status' },
];

export function AgentFilters({ teams, resultCount, totalSlots, allCapabilities, onChange }: AgentFiltersProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [team, setTeam] = useState('all');
  const [sort, setSort] = useState<SortOption>('name-asc');
  const [capabilities, setCapabilities] = useState<string[]>([]);

  const sortedCapabilities = useMemo(() => [...allCapabilities].sort(), [allCapabilities]);

  const hasActiveFilters = search.trim() !== '' || status !== 'all' || team !== 'all' || sort !== 'name-asc' || capabilities.length > 0;
  const activeFilterCount = [
    search.trim() !== '' ? 1 : 0,
    status !== 'all' ? 1 : 0,
    team !== 'all' ? 1 : 0,
    sort !== 'name-asc' ? 1 : 0,
    capabilities.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearAll = () => {
    setSearch('');
    setStatus('all');
    setTeam('all');
    setSort('name-asc');
    setCapabilities([]);
    onChange({ search: '', status: 'all', team: 'all', sort: 'name-asc', capabilities: [] });
  };

  const update = (patch: Partial<AgentFiltersState>) => {
    const next = { search, status, team, sort, capabilities, ...patch };
    onChange(next);
  };

  const toggleCapability = (cap: string) => {
    const next = capabilities.includes(cap) ? capabilities.filter((c) => c !== cap) : [...capabilities, cap];
    setCapabilities(next);
    update({ capabilities: next });
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[11px]">🔍</span>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); update({ search: e.target.value }); }}
            placeholder="Search by name, role, capability..."
            className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-xs text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-(--vestara-text-muted) uppercase">Status</span>
          {['all', 'active', 'disabled'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); update({ status: s }); }}
              className={`text-[10px] px-2 py-1 rounded-md cursor-pointer transition-colors ${status === s ? 'bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-text) font-medium' : 'text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg)'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={team}
          onChange={(e) => { setTeam(e.target.value); update({ team: e.target.value }); }}
          className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg px-2 py-1 text-[10px] outline-none focus:border-(--vestara-accent-border-active) cursor-pointer"
        >
          <option value="all">All Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortOption); update({ sort: e.target.value as SortOption }); }}
          className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg px-2 py-1 text-[10px] outline-none focus:border-(--vestara-accent-border-active) cursor-pointer"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-[10px] text-(--vestara-text-dim)">
          {resultCount} of {totalSlots}
        </span>
      </div>

      {/* Capability chips */}
      {sortedCapabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {sortedCapabilities.map((cap) => {
            const active = capabilities.includes(cap);
            return (
              <button
                key={cap}
                onClick={() => toggleCapability(cap)}
                className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                    : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) text-(--vestara-text-muted) hover:text-(--vestara-text-2)'
                }`}
              >
                {cap}
                {active && <span className="ml-1 text-[8px]">✕</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filter summary and Clear All */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-(--vestara-accent-border)">
          <span className="text-[9px] text-(--vestara-text-muted)">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </span>
          <button
            onClick={clearAll}
            className="text-[9px] text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
