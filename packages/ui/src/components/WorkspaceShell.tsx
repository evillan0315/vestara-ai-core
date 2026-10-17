/**
 * VES-UI-D11: Workspace Shell Layout
 *
 * Slot-based workspace shell extracted from
 * `assets/templates/html/Vestara-Shell-Layout.html`
 * (authoritative TSX source: `assets/templates/html/Vestara-Shell-Tsx.html`).
 *
 * Layout anatomy (top → bottom, left → right):
 *   TopBar (brand + search + actions)
 *   └── body: ActivityRail | SecondaryNav | Main (hero + content) | Inspector
 *
 * Every visual value binds a `--vestara-*` token — no hex literals, no
 * inline colour styles. Icons are caller-supplied `ReactNode` slots so this
 * package keeps zero icon dependencies.
 *
 * Architecture Traceability:
 *   VES-UI-D: Layout Shell (phases 9-11)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-008
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export interface WorkspaceRailItem {
  /** Stable item id */
  id: string;
  /** Accessible label / tooltip */
  label: string;
  /** Caller-supplied icon (keeps @vestara/ui icon-agnostic) */
  icon: ReactNode;
}

export interface WorkspaceNavSection {
  /** Section heading */
  label: string;
  /** Item ids in display order */
  items: string[];
  /** Resolve an id to its display label */
  getLabel?: (id: string) => string;
}

export interface WorkspaceShellProps {
  /** Main content */
  children: ReactNode;
  /** Active navigation id */
  activeNav?: string;
  /** Navigation change handler */
  onNavChange?: (nav: string) => void;
  /** Controlled search value (TopBar) */
  searchValue?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Command-palette trigger (⌘K) */
  onCommandPalette?: () => void;
  /** Whether the inspector rail is visible */
  showInspector?: boolean;
  /** Inspector content */
  inspectorContent?: ReactNode;
  /** Hero content rendered above main children */
  heroContent?: ReactNode;
  /** Custom class name */
  className?: string;
}

export interface WorkspaceTopBarProps {
  /** Brand mark slot (defaults to the "V" tile) */
  brand?: ReactNode;
  /** Product wordmark */
  brandName?: string;
  /** Release badge (e.g. BETA) */
  badge?: string;
  /** Controlled search value */
  searchValue?: string;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Command-palette trigger */
  onCommandPalette?: () => void;
  /** Trailing action slot (notifications, settings, avatar) */
  actions?: ReactNode;
  /** Custom class name */
  className?: string;
}

export interface WorkspaceActivityRailProps {
  /** Primary icon items */
  primaryItems?: WorkspaceRailItem[];
  /** Secondary icon items rendered below the divider */
  secondaryItems?: WorkspaceRailItem[];
  /** Active item id */
  activeNav?: string;
  /** Selection handler */
  onNavChange?: (nav: string) => void;
  /** Custom class name */
  className?: string;
}

export interface WorkspaceSecondaryNavProps {
  /** Navigation sections */
  sections?: WorkspaceNavSection[];
  /** Active item id */
  activeNav?: string;
  /** Selection handler */
  onNavChange?: (nav: string) => void;
  /** Footer slot (e.g. storage meter) */
  footer?: ReactNode;
  /** Custom class name */
  className?: string;
}

export interface WorkspaceInspectorProps {
  /** Inspector heading */
  title?: string;
  /** Status badge (e.g. LIVE) */
  statusBadge?: string;
  /** Inspector content */
  children?: ReactNode;
  /** Custom class name */
  className?: string;
}

export interface WorkspaceHeroStat {
  /** Stat label */
  label: string;
  /** Stat value */
  value: string;
  /** Caller-supplied icon */
  icon?: ReactNode;
}

export interface WorkspaceHeroProps {
  /** Eyebrow pill above the headline */
  eyebrow?: string;
  /** Whether the eyebrow pulse dot is shown */
  eyebrowLive?: boolean;
  /** Headline */
  title?: ReactNode;
  /** Accent line rendered under the headline */
  titleAccent?: string;
  /** Supporting copy */
  description?: string;
  /** Action slot */
  actions?: ReactNode;
  /** Stat tiles */
  stats?: WorkspaceHeroStat[];
  /** Custom class name */
  className?: string;
}

// ─── VestaraShell (root) ───────────────────────────────────────

export function VestaraShell({
  children,
  activeNav,
  onNavChange,
  searchValue,
  onSearchChange,
  onCommandPalette,
  showInspector = true,
  inspectorContent,
  heroContent,
  className = '',
}: WorkspaceShellProps) {
  return (
    <div
      className={`flex h-screen flex-col overflow-hidden bg-[var(--vestara-surface-canvas)] text-[var(--vestara-text-primary)] ${className}`}
    >
      <WorkspaceTopBar searchValue={searchValue} onSearchChange={onSearchChange} onCommandPalette={onCommandPalette} />
      <div className="flex min-h-0 flex-1">
        <WorkspaceActivityRail activeNav={activeNav} onNavChange={onNavChange} />
        <WorkspaceSecondaryNav activeNav={activeNav} onNavChange={onNavChange} />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          {heroContent}
          <div className="flex-1">{children}</div>
        </main>
        {showInspector && <WorkspaceInspector>{inspectorContent}</WorkspaceInspector>}
      </div>
    </div>
  );
}

// ─── WorkspaceTopBar ───────────────────────────────────────────

export function WorkspaceTopBar({
  brand,
  brandName = 'vestara',
  badge = 'BETA',
  searchValue,
  searchPlaceholder = 'Search capabilities, registries...',
  onSearchChange,
  onCommandPalette,
  actions,
  className = '',
}: WorkspaceTopBarProps) {
  return (
    <header
      className={`flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-4 ${className}`}
    >
      <div className="flex items-center gap-3">
        {brand ?? (
          <div className="grid h-7 w-7 place-items-center rounded-[var(--vestara-radius)] bg-[var(--vestara-accent)]">
            <span className="text-[11px] font-bold text-[var(--vestara-surface-canvas)]">V</span>
          </div>
        )}
        <span className="text-[13px] font-medium tracking-tight text-[var(--vestara-text-primary)]">{brandName}</span>
        <span className="rounded bg-[var(--vestara-surface-interactive)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-text-secondary)]">
          {badge}
        </span>
      </div>

      <div className="mx-8 max-w-[420px] flex-1">
        <div className="group relative">
          <input
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] pl-8 pr-20 text-[length:var(--vestara-font-size-base)] text-[var(--vestara-text-primary)] transition-colors placeholder:text-[var(--vestara-text-muted)] focus:border-[var(--vestara-accent-border-active)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onCommandPalette}
            className="absolute top-1 right-1 flex h-6 items-center gap-1 rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 text-[10px] text-[var(--vestara-text-muted)]"
            aria-label="Open command palette"
          >
            ⌘K
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1">{actions}</div>
    </header>
  );
}

// ─── WorkspaceActivityRail ─────────────────────────────────────

function RailButton({
  item,
  active,
  variant,
  onSelect,
}: {
  item: WorkspaceRailItem;
  active: boolean;
  variant: 'primary' | 'secondary';
  onSelect?: (id: string) => void;
}) {
  const activeClass =
    variant === 'primary'
      ? 'bg-[var(--vestara-accent)] text-[var(--vestara-surface-canvas)]'
      : 'border border-[var(--vestara-accent-border-active)] bg-[var(--vestara-surface-interactive)] text-[var(--vestara-accent)]';
  return (
    <button
      key={item.id}
      type="button"
      onClick={() => onSelect?.(item.id)}
      title={item.label}
      aria-label={item.label}
      aria-pressed={active}
      className={`grid h-9 w-9 place-items-center rounded-[var(--vestara-radius)] transition-colors ${
        active
          ? activeClass
          : 'text-[var(--vestara-text-muted)] hover:bg-[var(--vestara-surface-interactive)] hover:text-[var(--vestara-text-secondary)]'
      }`}
    >
      {item.icon}
    </button>
  );
}

export function WorkspaceActivityRail({
  primaryItems = [],
  secondaryItems = [],
  activeNav,
  onNavChange,
  className = '',
}: WorkspaceActivityRailProps) {
  return (
    <aside
      className={`flex w-[56px] shrink-0 flex-col items-center gap-6 border-r border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] py-4 ${className}`}
      aria-label="Workspace activity rail"
    >
      <div className="flex flex-col gap-1">
        {primaryItems.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={activeNav === item.id}
            variant="primary"
            onSelect={onNavChange}
          />
        ))}
      </div>

      {secondaryItems.length > 0 && (
        <>
          <div className="h-px w-6 bg-[var(--vestara-border-subtle)]" />
          <div className="flex flex-col gap-1">
            {secondaryItems.map((item) => (
              <RailButton
                key={item.id}
                item={item}
                active={activeNav === item.id}
                variant="secondary"
                onSelect={onNavChange}
              />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

// ─── WorkspaceSecondaryNav ─────────────────────────────────────

export function WorkspaceSecondaryNav({
  sections = [],
  activeNav,
  onNavChange,
  footer,
  className = '',
}: WorkspaceSecondaryNavProps) {
  return (
    <aside
      className={`flex w-[220px] shrink-0 flex-col gap-6 border-r border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] p-3 ${className}`}
      aria-label="Workspace secondary navigation"
    >
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <span className="mb-1 px-2 text-[10px] font-medium tracking-widest text-[var(--vestara-text-muted)] uppercase">
            {section.label}
          </span>
          {section.items.map((item) => {
            const active = activeNav === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onNavChange?.(item)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center justify-between rounded-[var(--vestara-radius)] px-2.5 py-1.5 text-left text-[length:var(--vestara-font-size-base)] transition-colors ${
                  active
                    ? 'border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] text-[var(--vestara-text-primary)]'
                    : 'text-[var(--vestara-text-secondary)] hover:bg-[var(--vestara-surface-panel)] hover:text-[var(--vestara-text-primary)]'
                }`}
              >
                <span>{section.getLabel?.(item) ?? item}</span>
                {active && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vestara-accent)]" />}
              </button>
            );
          })}
        </div>
      ))}

      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  );
}

// ─── WorkspaceInspector ────────────────────────────────────────

export function WorkspaceInspector({
  title = 'Inspector',
  statusBadge = 'LIVE',
  children,
  className = '',
}: WorkspaceInspectorProps) {
  return (
    <aside
      className={`flex w-[280px] shrink-0 flex-col border-l border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] ${className}`}
      aria-label="Workspace inspector"
    >
      <div className="flex h-[44px] items-center justify-between border-b border-[var(--vestara-border-subtle)] px-4">
        <span className="text-[12px] font-medium tracking-wide text-[var(--vestara-text-primary)] uppercase">
          {title}
        </span>
        <span className="rounded bg-[var(--vestara-surface-interactive)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-accent)]">
          {statusBadge}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </aside>
  );
}

// ─── WorkspaceHero ─────────────────────────────────────────────

export function WorkspaceHero({
  eyebrow,
  eyebrowLive = true,
  title,
  titleAccent,
  description,
  actions,
  stats = [],
  className = '',
}: WorkspaceHeroProps) {
  return (
    <div
      className={`relative overflow-hidden border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] ${className}`}
    >
      <div className="relative px-8 py-10">
        {eyebrow && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] px-2.5 py-1 text-[11px] text-[var(--vestara-accent)]">
            {eyebrowLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vestara-accent)]" />}
            {eyebrow}
          </div>
        )}

        {(title || titleAccent) && (
          <h1 className="mt-5 max-w-[520px] text-[32px] leading-[0.95] font-[550] tracking-[-0.03em] text-[var(--vestara-text-primary)]">
            {title}
            {title && titleAccent && <br />}
            {titleAccent && <span className="text-[var(--vestara-accent)]">{titleAccent}</span>}
          </h1>
        )}

        {description && (
          <p className="mt-3 max-w-[420px] text-[14px] leading-6 text-[var(--vestara-text-secondary)]">{description}</p>
        )}

        {actions && <div className="mt-6 flex items-center gap-2">{actions}</div>}

        {stats.length > 0 && (
          <div className="mt-8 grid max-w-[520px] grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-2.5 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-2.5"
              >
                {stat.icon && (
                  <div className="grid h-7 w-7 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] text-[var(--vestara-accent)]">
                    {stat.icon}
                  </div>
                )}
                <div>
                  <div className="text-[12px] leading-none font-medium text-[var(--vestara-text-primary)]">
                    {stat.value}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--vestara-text-muted)]">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
