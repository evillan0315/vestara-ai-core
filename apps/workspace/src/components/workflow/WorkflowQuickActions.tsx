/**
 * WorkflowQuickActions — shortcut tiles for the Orchestration footer.
 *
 * Presentation only: each tile carries its own onSelect handler from the
 * page. No fetching, no state — the page owns creation, approvals, graph,
 * and evidence routing.
 */

export interface WorkflowQuickAction {
  id: string;
  label: string;
  sub: string;
  tile: string;
  glyph: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface WorkflowQuickActionsProps {
  actions: WorkflowQuickAction[];
}

export function WorkflowQuickActions({ actions }: WorkflowQuickActionsProps) {
  return (
    <ul className="grid list-none grid-cols-2 gap-[var(--vestara-spacing-3)] p-0 md:grid-cols-4" aria-label="Workflow quick actions">
      {actions.map((action, i) => (
        <li key={action.id} className="mpg-enter" style={{ animationDelay: `${i * 40}ms` }}>
          <button
            type="button"
            onClick={action.onSelect}
            disabled={action.disabled}
            className="mpg-card group flex w-full items-center gap-[var(--vestara-spacing-3)] p-3.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span
              aria-hidden="true"
              className="mpg-icon-box text-[var(--ov-solid-on-tile)]"
              style={{
                color: 'var(--ov-solid-on-tile)',
                background: `color-mix(in srgb, ${action.tile} 88%, transparent)`,
                borderColor: `color-mix(in srgb, ${action.tile} 55%, transparent)`,
                boxShadow: `color-mix(in srgb, ${action.tile} 40%, transparent)`,
              }}
            >
              {action.glyph}
            </span>
            <span className="relative z-[2] min-w-0 flex-1">
              <span className="block truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                {action.label}
              </span>
              <span className="block truncate text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{action.sub}</span>
            </span>
            <span aria-hidden="true" className="relative z-[2] text-[var(--vestara-marketplace-primary)] transition-transform group-hover:translate-x-0.5">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
