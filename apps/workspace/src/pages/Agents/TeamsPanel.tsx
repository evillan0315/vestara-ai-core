import { useState } from 'react';
import { getAgentColor } from './constants';
import type { Agent, Team } from './types';

interface TeamsPanelProps {
  teams: Team[];
  agents: Agent[];
  onLoad: () => void;
  onOpenTeamCreator: () => void;
}

export default function TeamsPanel({ teams, agents, onLoad, onOpenTeamCreator }: TeamsPanelProps) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMemberSearch, setTeamMemberSearch] = useState<Record<string, string>>({});

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1 h-3 rounded-full bg-purple-500/60" /> Teams
          <span className="text-(--vestara-text-dim) font-normal">({teams.length})</span>
        </h3>
        <button
          onClick={onOpenTeamCreator}
          className="text-[9px] text-(--vestara-text-muted) hover:text-(--vestara-text-2) transition-colors cursor-pointer"
        >
          + New
        </button>
      </div>
      {teams.length === 0 ? (
        <p className="text-[10px] text-(--vestara-text-dim) py-3 text-center italic">No teams yet</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {teams.map((team) => {
            const isExpandedT = expandedTeam === team.id;
            const leader = agents.find((a) => a.id === team.leaderAgentId);
            const members = agents.filter((a) => team.memberIds.includes(a.id) || a.teamId === team.id);
            const search = teamMemberSearch[team.id] || '';
            const unassigned = agents.filter(
              (a) =>
                a.status === 'active' &&
                !team.memberIds.includes(a.id) &&
                a.teamId !== team.id &&
                a.id !== team.leaderAgentId,
            );
            const addMember = async (agentId: string) => {
              await fetch(`/api/teams/${team.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ add: [agentId] }),
              });
              onLoad();
            };
            const removeMember = async (agentId: string) => {
              await fetch(`/api/teams/${team.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ remove: [agentId] }),
              });
              onLoad();
            };
            const setLeader = async (agentId: string) => {
              await fetch(`/api/teams/${team.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leaderAgentId: agentId }),
              });
              onLoad();
            };
            const deleteTeamFn = async () => {
              if (!window.confirm(`Delete team "${team.name}"?`)) return;
              await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
              onLoad();
            };
            return (
              <div key={team.id} className="border border-(--vestara-accent-border) rounded-lg overflow-hidden">
                <div
                  className="p-2.5 bg-(--vestara-accent-bg) flex items-center justify-between cursor-pointer hover:bg-(--vestara-accent-bg) transition-colors"
                  onClick={() => setExpandedTeam(isExpandedT ? null : team.id)}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-(--vestara-text) font-medium truncate">{team.name}</div>
                    <div className="text-[8px] text-(--vestara-text-muted) flex items-center gap-1">
                      {members.length} members{leader ? ` · leader: ${leader.name}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-(--vestara-text-muted) text-[10px] shrink-0 transition-transform ${isExpandedT ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </div>
                {isExpandedT && (
                  <div className="p-2.5 space-y-2 border-t border-(--vestara-accent-border)">
                    <div className="space-y-1">
                      {members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 text-[10px] group py-0.5 px-1 rounded hover:bg-(--vestara-accent-bg) transition-colors"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: getAgentColor(m) }}
                          />
                          <span className="text-(--vestara-text) flex-1 truncate">{m.name}</span>
                          <span className="text-[8px] text-(--vestara-text-dim)">{m.role}</span>
                          <button
                            onClick={() => void setLeader(m.id)}
                            className="text-[8px] text-(--vestara-text-muted) hover:text-(--vestara-text-2) opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Set as leader"
                          >
                            👑
                          </button>
                          <button
                            onClick={() => void removeMember(m.id)}
                            className="text-[8px] text-(--vestara-text-muted) hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    {unassigned.length > 0 && (
                      <div>
                        <input
                          value={search}
                          onChange={(e) => setTeamMemberSearch((prev) => ({ ...prev, [team.id]: e.target.value }))}
                          placeholder="Add agent..."
                          className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-[9px] px-2 py-1 text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
                        />
                        <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                          {unassigned
                            .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))
                            .slice(0, 5)
                            .map((a) => (
                              <button
                                key={a.id}
                                onClick={() => void addMember(a.id)}
                                className="w-full flex items-center gap-2 text-[9px] text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) rounded-md px-1.5 py-1 transition-colors cursor-pointer"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: getAgentColor(a) }}
                                />
                                <span className="truncate">{a.name}</span>
                                <span className="text-(--vestara-text-dim) ml-auto text-[11px]">+</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-1 pt-1 border-t border-(--vestara-accent-border)">
                      <button
                        onClick={() => void deleteTeamFn()}
                        className="text-[8px] px-2 py-0.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-red-400 rounded-md hover:bg-red-400/10 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
