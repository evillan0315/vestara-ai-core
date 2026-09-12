/**
 * VES-OVERVIEW-001: Quick Actions Component
 *
 * 5 horizontal builder cards on the Marketplace gallery card grammar
 * (mpg-card hover lift + glow, mpg-icon-box tiles, chevron).
 * Client-side shell navigation via Link.
 */

import { Link } from 'react-router-dom';

interface QuickAction {
  id: string;
  label: string;
  sub: string;
  href: string;
  tile: string;
  glyph: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'project', label: 'New Project', sub: 'Start building', href: '/projects', tile: 'var(--vestara-status-info)', glyph: '✚' },
  { id: 'workflow', label: 'Create Workflow', sub: 'Automate work', href: '/workflows', tile: 'var(--vestara-accent-primary)', glyph: '⁂' },
  { id: 'files', label: 'Open Files', sub: 'Browse workspace', href: '/files', tile: 'var(--vestara-status-success)', glyph: '▤' },
  { id: 'terminal', label: 'Launch Terminal', sub: 'Start a session', href: '/terminal', tile: 'var(--vestara-text-muted)', glyph: '›_' },
  { id: 'marketplace', label: 'Explore Marketplace', sub: 'Add modules, agents, tools', href: '/marketplace', tile: 'var(--vestara-marketplace-primary)', glyph: '▦' },
];

export function QuickActions() {
  return (
    <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Quick actions">
      {QUICK_ACTIONS.map((action, i) => (
        <li key={action.id} className="mpg-enter" style={{ animationDelay: `${i * 40}ms` }}>
          <Link
            to={action.href}
            className="mpg-card group flex items-center gap-3 p-3.5"
          >
            <span
              aria-hidden="true"
              className="mpg-icon-box text-white"
              style={{
                color: '#fff',
                background: `color-mix(in srgb, ${action.tile} 88%, transparent)`,
                borderColor: `color-mix(in srgb, ${action.tile} 55%, transparent)`,
                boxShadow: `0 0 14px color-mix(in srgb, ${action.tile} 40%, transparent)`,
              }}
            >
              {action.glyph}
            </span>
            <span className="relative z-[2] min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--vestara-text-primary)]">
                {action.label}
              </span>
              <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{action.sub}</span>
            </span>
            <span aria-hidden="true" className="relative z-[2] text-[var(--vestara-marketplace-primary)] transition-transform group-hover:translate-x-0.5">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
