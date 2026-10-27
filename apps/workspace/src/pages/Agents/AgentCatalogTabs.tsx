export type AgentCatalogTab = 'all' | 'mine' | 'system' | 'custom' | 'skills';

export const AGENT_CATALOG_TABS: Array<{ id: AgentCatalogTab; label: string }> = [
  { id: 'all', label: 'All Agents' },
  { id: 'mine', label: 'My Agents' },
  { id: 'system', label: 'System Agents' },
  { id: 'custom', label: 'Custom Agents' },
  { id: 'skills', label: 'Skill Library' },
];

interface AgentCatalogTabsProps {
  activeTab: AgentCatalogTab;
  onChange: (tab: AgentCatalogTab) => void;
}

/**
 * AgentCatalogTabs — catalog view switcher for the Agent Control page.
 *
 * Presentation only: the active tab is controlled by the page (`Agents.tsx`);
 * filtering for the selected tab lives in `useAgentCatalog`.
 */
export function AgentCatalogTabs({ activeTab, onChange }: AgentCatalogTabsProps) {
  return (
    <div
      className="mb-4 flex min-w-0 gap-1 overflow-x-auto border-b border-[var(--vestara-border-subtle)]"
      role="tablist"
      aria-label="Agent catalog views"
    >
      {AGENT_CATALOG_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-[var(--vestara-font-size-sm)] transition-colors ${activeTab === tab.id ? 'border-[var(--vestara-accent)] text-[var(--vestara-text-primary)]' : 'border-transparent text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-text-primary)]'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
