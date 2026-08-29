import { useMemo, useState } from 'react';
import { AgentCard } from './AgentCard';
import { CATEGORY_COLORS, CATEGORY_DESCRIPTIONS, CATEGORY_ICONS, CATEGORY_ORDER, ROLE_CATEGORIES } from './constants';
import type { Agent, AgentStats, Execution, HarnessSessionEntry, Team } from './types';

interface AgentCategoryListProps {
  agents: Agent[];
  teams: Team[];
  executions: Execution[];
  agentStats: Record<string, AgentStats>;
  selectedAgent: Agent | null;
  harnessSessions: HarnessSessionEntry[];
  onSelectAgent: (agent: Agent | null) => void;
  onEditAgent: (agent: Agent) => void;
  onToggleStatus: (agent: Agent) => void;
  onDeleteAgent: (id: string) => void;
  onOpenExecution: (execution: Execution) => void;
  onLoad: () => void;
}

export function AgentCategoryList({
  agents,
  teams,
  executions,
  agentStats,
  selectedAgent,
  harnessSessions,
  onSelectAgent,
  onEditAgent,
  onToggleStatus,
  onDeleteAgent,
  onOpenExecution,
  onLoad,
}: AgentCategoryListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('vestara-agent-collapsed-categories') || '{}');
    } catch {
      return {};
    }
  });

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      localStorage.setItem('vestara-agent-collapsed-categories', JSON.stringify(next));
      return next;
    });
  };

  const groupedAgents = useMemo(() => {
    const groups: Record<string, typeof agents> = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const agent of agents) {
      const cat = ROLE_CATEGORIES[agent.role] || 'Specialized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(agent);
    }
    return groups;
  }, [agents]);

  const allCollapsed = CATEGORY_ORDER.every(
    (cat) => collapsedCategories[cat] === true || !groupedAgents[cat]?.length,
  );
  const allExpanded = CATEGORY_ORDER.every(
    (cat) => collapsedCategories[cat] !== true || !groupedAgents[cat]?.length,
  );

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    const newState = !allCollapsed;
    for (const cat of CATEGORY_ORDER) {
      if (groupedAgents[cat]?.length) next[cat] = newState;
    }
    setCollapsedCategories(next);
    localStorage.setItem('vestara-agent-collapsed-categories', JSON.stringify(next));
  };

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
        <div className="text-2xl mb-2 opacity-30">☰</div>
        <p className="text-sm text-(--vestara-text-2) b-1">No agents found</p>
        <p className="text-xs text-(--vestara-text-dim)">Adjust your filters or register a new agent</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={toggleAll}
          className="text-[9px] px-2 py-1 text-(--vestara-text-muted) hover:text-(--vestara-text-2) border border-(--vestara-accent-border) rounded-md transition-colors cursor-pointer"
        >
          {allCollapsed ? 'Expand All' : 'Collapse All'}
        </button>
      </div>
      {CATEGORY_ORDER.map((cat) => {
        const catAgents = groupedAgents[cat];
        if (!catAgents || catAgents.length === 0) return null;
        const isCollapsed = collapsedCategories[cat] === true;
        const catColor = CATEGORY_COLORS[cat] || '#6b7280';
        const activeCount = catAgents.filter((a) => a.status === 'active').length;
        return (
          <div key={cat} className="mb-4">
            {/* Category header */}
            <button
              type="button"
              onClick={() => toggleCategory(cat)}
              className="flex items-center gap-2 w-full px-2 py-2 mb-1 cursor-pointer group rounded-md transition-colors hover:bg-(--vestara-accent-bg)"
              style={{ borderLeft: `2px solid ${catColor}` }}
            >
              <span className="text-sm shrink-0" style={{ color: catColor }}>
                {CATEGORY_ICONS[cat] || '●'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--vestara-text-2)">
                    {cat}
                  </span>
                  <span className="text-[9px] text-(--vestara-text-dim)">
                    {catAgents.length} · {activeCount} active
                  </span>
                </div>
                <div className="text-[9px] text-(--vestara-text-dim) truncate">
                  {CATEGORY_DESCRIPTIONS[cat]}
                </div>
              </div>
              <span className="text-(--vestara-text-dim) text-[11px] transition-transform group-hover:text-(--vestara-text-2) shrink-0">
                {isCollapsed ? '▸' : '▾'}
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-2">
                {catAgents.map((agent) => {
                  const isExpanded = selectedAgent?.id === agent.id;
                  const team = teams.find((t) => t.id === agent.teamId);
                  const stats = agentStats[agent.id] || {
                    total: 0,
                    completed: 0,
                    failed: 0,
                    running: 0,
                    avgDuration: 0,
                  };
                  return (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isExpanded={isExpanded}
                      team={team}
                      stats={stats}
                      executions={executions}
                      harnessSessions={harnessSessions}
                      onToggle={() => onSelectAgent(isExpanded ? null : agent)}
                      onEdit={() => onEditAgent(agent)}
                      onToggleStatus={() => onToggleStatus(agent)}
                      onDelete={() => onDeleteAgent(agent.id)}
                      onOpenExecution={onOpenExecution}
                      onLoad={onLoad}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
