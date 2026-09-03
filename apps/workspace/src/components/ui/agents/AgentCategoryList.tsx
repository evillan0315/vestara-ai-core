import { useMemo, useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_DESCRIPTIONS, CATEGORY_ICONS, CATEGORY_ORDER, deriveCategory } from './deriveCategory';
import type { AgentIdentity } from './types';

export interface AgentCategoryListProps {
  agents: AgentIdentity[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
  renderAgent?: (agent: AgentIdentity, isExpanded: boolean) => React.ReactNode;
}

/**
 * Groups agents by derived category with collapsible sections.
 *
 * Uses deriveCategory() instead of hardcoded ROLE_CATEGORIES.
 * Unknown roles gracefully fall to "Specialized."
 *
 * The renderAgent slot allows each consumer to provide context-specific
 * agent rendering (e.g., Agent Control passes expanded card with tabs,
 * Activity Room passes simple summary).
 */
export function AgentCategoryList({
  agents,
  selectedAgentId,
  onSelectAgent,
  renderAgent,
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
    const groups: Record<string, AgentIdentity[]> = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const agent of agents) {
      const cat = deriveCategory(agent.role);
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
        <div className="text-2xl mb-2 opacity-30">&#9776;</div>
        <p className="text-sm text-(--vestara-text-2)">No agents found</p>
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
                {CATEGORY_ICONS[cat] || '\u25cf'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--vestara-text-2)">
                    {cat}
                  </span>
                  <span className="text-[9px] text-(--vestara-text-dim)">
                    {catAgents.length} &middot; {activeCount} active
                  </span>
                </div>
                <div className="text-[9px] text-(--vestara-text-dim) truncate">
                  {CATEGORY_DESCRIPTIONS[cat]}
                </div>
              </div>
              <span className="text-(--vestara-text-dim) text-[11px] transition-transform group-hover:text-(--vestara-text-2) shrink-0">
                {isCollapsed ? '\u25b8' : '\u25be'}
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-2">
                {catAgents.map((agent) => {
                  const isExpanded = selectedAgentId === agent.id;
                  return (
                    <div key={agent.id}>
                      {renderAgent
                        ? renderAgent(agent, isExpanded)
                        : /* Default: simple clickable row */
                          <button
                            type="button"
                            onClick={() => onSelectAgent?.(agent.id)}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--vestara-text)">
                                {agent.name}
                              </span>
                              <span className="text-[7px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase">
                                {agent.role}
                              </span>
                              {agent.status && (
                                <span className="text-[8px] text-(--vestara-text-dim)">
                                  {agent.status}
                                </span>
                              )}
                            </div>
                            {agent.description && (
                              <div className="text-[9px] text-(--vestara-text-dim) truncate mt-0.5">
                                {agent.description}
                              </div>
                            )}
                          </button>
                      }
                    </div>
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
