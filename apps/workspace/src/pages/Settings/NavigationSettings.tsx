/**
 * VES-DESIGN-006: navigation CRUD (Settings → Navigation).
 *
 * Manage the workspace sidebar without code changes:
 * - Toggle visibility for every registry menu (registry entries are
 *   never deleted — hiding is presentation, not authorization).
 * - Full CRUD for custom menus: add (label/path/icon/order),
 *   edit, hide, delete.
 *
 * State lives in the shared navigation store (lib/navigation-store.ts):
 * the sidebar updates live in the same tab, and entries persist to
 * localStorage + the workspace server.
 */

import { useMemo, useState } from 'react';
import {
  NAV_ICON_KEYS,
  WORKSPACE_NAVIGATION,
  navIcon,
  type WorkspaceNavIcon,
} from '../../layouts/workspace-navigation.js';
import {
  addCustomNavEntry,
  deleteCustomNavEntry,
  setNavVisibility,
  updateCustomNavEntry,
  useNavigationStore,
  type CustomNavEntry,
} from '../../lib/navigation-store.js';
import { Button, SettingsSection, Toggle, input } from './settings-ui.js';

function RowShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] py-3 first:border-t-0">
      {children}
    </div>
  );
}

/** Presentation labels for registry groups (ids stay authoritative in the model). */
const NAV_GROUP_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  build: 'Build',
  automation: 'Automation',
  runtime: 'Runtime',
  operations: 'Operations',
  extend: 'Extend',
  system: 'System',
};

const NAV_GROUP_TILE_FG: Record<string, string> = {
  workspace: 'var(--st-tile-workspace-fg)',
  build: 'var(--st-tile-runtime-fg)',
  automation: 'var(--st-tile-engineering-fg)',
  runtime: 'var(--st-tile-runtime-fg)',
  operations: 'var(--st-tile-operations-fg)',
  extend: 'var(--st-tile-advanced-fg)',
  system: 'var(--st-tile-advanced-fg)',
};

function NavIconTile({ iconKey, group }: { iconKey: WorkspaceNavIcon; group: string }) {
  const tone = NAV_GROUP_TILE_FG[group] ?? 'var(--st-tile-advanced-fg)';
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-[var(--vestara-radius)] border [&_svg]:size-[18px]"
      style={{
        color: tone,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
      }}
    >
      {navIcon(iconKey)}
    </span>
  );
}

function VisibilityToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  // Dedicated trailing control region (VES-DESIGN-007B): identical geometry
  // on every row regardless of label/description/metadata length or
  // enabled/disabled state. Content keeps flex:1 + min-width:0; the control
  // owns a fixed aligned slot.
  return (
    <span className="ml-auto flex w-[5.5rem] shrink-0 items-center justify-end gap-2">
      <span
        aria-hidden="true"
        className={`w-8 text-right text-xs font-medium ${checked ? 'text-[var(--vestara-green)]' : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]'}`}
      >
        {checked ? 'On' : 'Off'}
      </span>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </span>
  );
}

interface Draft {
  label: string;
  path: string;
  icon: WorkspaceNavIcon;
  order: string;
}

const EMPTY_DRAFT: Draft = { label: '', path: '/', icon: 'generic', order: '105' };

function CustomForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (draft: Draft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const valid = draft.label.trim().length > 0 && draft.path.trim().startsWith('/');
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_6rem_auto]">
      <input
        aria-label="Menu label"
        placeholder="Label — e.g. Runbooks"
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        className={input}
      />
      <input
        aria-label="Menu path"
        placeholder="Path — e.g. /runbooks"
        value={draft.path}
        onChange={(e) => setDraft({ ...draft, path: e.target.value })}
        className={input}
      />
      <select
        aria-label="Menu icon"
        value={draft.icon}
        onChange={(e) => setDraft({ ...draft, icon: e.target.value as WorkspaceNavIcon })}
        className={input}
      >
        {NAV_ICON_KEYS.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      <input
        aria-label="Menu order"
        placeholder="Order"
        inputMode="numeric"
        value={draft.order}
        onChange={(e) => setDraft({ ...draft, order: e.target.value })}
        className={input}
      />
      <div className="flex gap-2">
        <Button primary disabled={!valid} onClick={() => valid && onSubmit(draft)}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
      {!valid && (draft.label.trim() || draft.path.trim() !== '/') && (
        <p className="text-xs text-[var(--vestara-text-muted)] sm:col-span-full">
          Label is required and path must start with “/”.
        </p>
      )}
    </div>
  );
}

export default function NavigationSettings() {
  const store = useNavigationStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of WORKSPACE_NAVIGATION) {
      const override = store.visibility[entry.id];
      if (override ?? entry.tier === 'primary') ids.add(entry.id);
    }
    for (const c of store.custom) {
      if (c.visible !== false) ids.add(c.id);
    }
    return ids;
  }, [store]);

  const orderedRegistry = useMemo(
    () => [...WORKSPACE_NAVIGATION].sort((a, b) => a.order - b.order),
    [],
  );

  // Registry grouping drives the panels (no hardcoded domain content) —
  // groups follow registry order; visibility semantics are unchanged.
  const groupedRegistry = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, typeof orderedRegistry>();
    for (const entry of orderedRegistry) {
      if (!byGroup.has(entry.group)) {
        byGroup.set(entry.group, []);
        order.push(entry.group);
      }
      byGroup.get(entry.group)?.push(entry);
    }
    return order.map((group) => ({ group, entries: byGroup.get(group) ?? [] }));
  }, [orderedRegistry]);

  const toDraft = (c: CustomNavEntry): Draft => ({
    label: c.label,
    path: c.path,
    icon: c.icon,
    order: String(c.order),
  });

  return (
    <section className="st-panel min-w-0">
      <header className="st-card-header st-gap-field st-px-card st-py-card flex min-w-0 items-start border-b border-[var(--vestara-border-subtle)]">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[color-mix(in_srgb,var(--vestara-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-accent)_12%,transparent)] text-[var(--vestara-accent-text)] [&_svg]:size-5"
        >
          {navIcon('routing')}
        </span>
        <div className="min-w-0">
          <h2 className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">
            Navigation
          </h2>
          <p className="st-mt-element max-w-2xl text-[var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-muted)]">
            Sidebar menus and custom entries. Panels share one height and scroll past it. Hiding is
            presentation only — pages stay reachable through search.
          </p>
        </div>
      </header>
      <div className="st-card-body st-pad-card">
        <div className="grid min-w-0 items-stretch gap-[var(--vestara-spacing-section)] md:grid-cols-2 xl:grid-cols-3">
          {groupedRegistry.map(({ group, entries }) => (
            <div key={group} className="st-nav-fixed min-w-0">
              <SettingsSection
                title={NAV_GROUP_LABELS[group] ?? group}
                description={`${entries.length} sidebar ${entries.length === 1 ? 'menu' : 'menus'}. Hiding is presentation only — pages stay reachable through search.`}
              >
          <div>
            {entries.map((entry) => {
              const visible = visibleIds.has(entry.id);
              const metadata = `${entry.path ?? '(action)'} · ${entry.tier} · ${entry.group}`;
              return (
                <RowShell key={entry.id}>
                  <NavIconTile iconKey={entry.icon} group={entry.group} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                      {entry.label}
                    </span>
                    {entry.description && (
                      <span className="mt-0.5 block text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                        {entry.description}
                      </span>
                    )}
                    <span
                      className="mt-0.5 block truncate font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-dim,var(--vestara-text-dim))]"
                      title={metadata}
                    >
                      {metadata}
                    </span>
                  </span>
                  <VisibilityToggle
                    label={`${visible ? 'Hide' : 'Show'} ${entry.label} in sidebar`}
                    checked={visible}
                    onChange={(next) => setNavVisibility(entry.id, next)}
                  />
                </RowShell>
              );
            })}
          </div>
              </SettingsSection>
            </div>
          ))}

          <div className="st-nav-fixed min-w-0">
            <SettingsSection
              title="Custom menus"
              description="Your own sidebar entries. Fully owned here: add, edit, reorder, hide, delete."
            >
        <div>
          {store.custom.length === 0 && (
            <p className="py-3 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              No custom menus yet — add one below.
            </p>
          )}
          {store.custom.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] py-3 first:border-t-0">
                <CustomForm
                  initial={toDraft(c)}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    updateCustomNavEntry(c.id, {
                      label: draft.label.trim(),
                      path: draft.path.trim(),
                      icon: draft.icon,
                      order: Number(draft.order) || 105,
                    });
                    setEditingId(null);
                  }}
                />
              </div>
            ) : (
              <RowShell key={c.id}>
                <NavIconTile iconKey={c.icon} group="system" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                    {c.label}
                  </span>
                  <span
                    className="mt-0.5 block truncate font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-dim,var(--vestara-text-dim))]"
                    title={`${c.path} · order ${c.order}`}
                  >
                    {c.path} · order {c.order}
                  </span>
                </span>
                <VisibilityToggle
                  label={`${c.visible !== false ? 'Hide' : 'Show'} ${c.label} in sidebar`}
                  checked={c.visible !== false}
                  onChange={(next) => updateCustomNavEntry(c.id, { visible: next })}
                />
                <span className="flex shrink-0 gap-2">
                  <Button onClick={() => setEditingId(c.id)}>Edit</Button>
                  <Button onClick={() => deleteCustomNavEntry(c.id)}>Delete</Button>
                </span>
              </RowShell>
            ),
          )}
          <div className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] py-3">
            {showAdd ? (
              <CustomForm
                initial={EMPTY_DRAFT}
                submitLabel="Add menu"
                onCancel={() => setShowAdd(false)}
                onSubmit={(draft) => {
                  addCustomNavEntry({
                    label: draft.label.trim(),
                    path: draft.path.trim(),
                    icon: draft.icon,
                    order: Number(draft.order) || 105,
                    visible: true,
                  });
                  setShowAdd(false);
                }}
              />
            ) : (
              <Button primary onClick={() => setShowAdd(true)}>
                + Add menu
              </Button>
            )}
          </div>
            </div>
            </SettingsSection>
          </div>
        </div>
      </div>
    </section>
  );
}
