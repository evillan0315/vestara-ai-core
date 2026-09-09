/**
 * VES-OVERVIEW-001: Quick Actions Component
 *
 * Quick action buttons for common tasks.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  href: string;
  description: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'project', label: 'New Project', icon: '📁', href: '/projects', description: 'Start a new project' },
  { id: 'workflow', label: 'Create Workflow', icon: '⚡', href: '/workflows', description: 'Design a workflow' },
  { id: 'files', label: 'Open Files', icon: '📄', href: '/files', description: 'Browse repository files' },
  { id: 'terminal', label: 'Launch Terminal', icon: '💻', href: '/terminal', description: 'Open a terminal session' },
  { id: 'marketplace', label: 'Explore Marketplace', icon: '🛒', href: '/marketplace', description: 'Discover tools and extensions' },
];

export function QuickActions() {
  return (
    <div className="rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)] mb-3">
        Quick Actions
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <a
            key={action.id}
            href={action.href}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] hover:border-[var(--vestara-accent-primary)]/30 hover:bg-[var(--vestara-accent-primary)]/5 transition-all duration-150 text-center"
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="text-xs font-medium text-[var(--vestara-text-primary)]">
              {action.label}
            </span>
            <span className="text-[10px] text-[var(--vestara-text-muted)]">
              {action.description}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
