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
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 first:border-t-0 sm:px-5">
      {children}
    </div>
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

  const toDraft = (c: CustomNavEntry): Draft => ({
    label: c.label,
    path: c.path,
    icon: c.icon,
    order: String(c.order),
  });

  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <SettingsSection
        title="Sidebar menus"
        description="Toggle any registry menu. Hiding is presentation only — pages stay reachable through search."
      >
        <div>
          {orderedRegistry.map((entry) => {
            const visible = visibleIds.has(entry.id);
            return (
              <RowShell key={entry.id}>
                <span aria-hidden="true" className="text-[var(--vestara-text-muted)]">
                  {navIcon(entry.icon)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                    {entry.path ?? '(action)'} · {entry.tier} · {entry.group}
                  </span>
                </span>
                <Toggle
                  label={`${visible ? 'Hide' : 'Show'} ${entry.label} in sidebar`}
                  checked={visible}
                  onChange={(next) => setNavVisibility(entry.id, next)}
                />
              </RowShell>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Custom menus"
        description="Your own sidebar entries. Fully owned here: add, edit, reorder, hide, delete."
      >
        <div>
          {store.custom.length === 0 && (
            <p className="px-4 py-3 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:px-5">
              No custom menus yet — add one below.
            </p>
          )}
          {store.custom.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 first:border-t-0 sm:px-5">
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
                <span aria-hidden="true" className="text-[var(--vestara-text-muted)]">
                  {navIcon(c.icon)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                    {c.label}
                  </span>
                  <span className="mt-0.5 block font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                    {c.path} · order {c.order}
                  </span>
                </span>
                <Toggle
                  label={`${c.visible !== false ? 'Hide' : 'Show'} ${c.label} in sidebar`}
                  checked={c.visible !== false}
                  onChange={(next) => updateCustomNavEntry(c.id, { visible: next })}
                />
                <Button onClick={() => setEditingId(c.id)}>Edit</Button>
                <Button onClick={() => deleteCustomNavEntry(c.id)}>Delete</Button>
              </RowShell>
            ),
          )}
          <div className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 sm:px-5">
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
  );
}
