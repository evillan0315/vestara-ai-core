import { useState } from 'react';
import type { Team } from './types';

export interface AgentFiltersState {
  search: string;
  status: string;
  team: string;
}

interface AgentFiltersProps {
  teams: Team[];
  resultCount: number;
  totalSlots: number;
  onChange: (filters: AgentFiltersState) => void;
}

export function AgentFilters({ teams, resultCount, totalSlots, onChange }: AgentFiltersProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [team, setTeam] = useState('all');

  const updateSearch = (value: string) => {
    setSearch(value);
    onChange({ search: value, status, team });
  };

  const updateStatus = (value: string) => {
    setStatus(value);
    onChange({ search, status: value, team });
  };

  const updateTeam = (value: string) => {
    setTeam(value);
    onChange({ search, status, team: value });
  };

  return (
    <div className="flex items-center gap-3 mb-4 text-xs flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[11px]">🔍</span>
        <input
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Search by name, role, capability..."
          className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-xs text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-(--vestara-text-muted) uppercase">Status</span>
        {['all', 'active', 'disabled'].map((s) => (
          <button
            key={s}
            onClick={() => updateStatus(s)}
            className={`text-[10px] px-2 py-1 rounded-md cursor-pointer transition-colors ${status === s ? 'bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-text) font-medium' : 'text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg)'}`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <select
        value={team}
        onChange={(e) => updateTeam(e.target.value)}
        className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg px-2 py-1 text-[10px] outline-none focus:border-(--vestara-accent-border-active) cursor-pointer"
      >
        <option value="all">All Teams</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-(--vestara-text-dim)">
        {resultCount} of {totalSlots}
      </span>
    </div>
  );
}
