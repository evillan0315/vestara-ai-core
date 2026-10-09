import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ViewComfyRoundedIcon from '@mui/icons-material/ViewComfyRounded';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import ViewModuleRoundedIcon from '@mui/icons-material/ViewModuleRounded';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel.js';

export type ConfigurationViewMode = 'cards' | 'list' | 'table' | 'thumbnails';

export interface ConfigurationFact {
  label: string;
  value: ReactNode;
  title?: string;
}

export interface ConfigurationItem {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  facts: readonly ConfigurationFact[];
  tone?: 'accent' | 'info';
}

export interface ConfigurationActionButtonProps {
  label: string;
  onClick: () => void;
}

interface ConfigurationViewProps {
  items: readonly ConfigurationItem[];
  mode: ConfigurationViewMode;
  onModeChange: (mode: ConfigurationViewMode) => void;
}

const MODES: readonly { id: ConfigurationViewMode; label: string; icon: ReactNode }[] = [
  { id: 'cards', label: 'Cards', icon: <ViewModuleRoundedIcon fontSize="small" /> },
  { id: 'list', label: 'List', icon: <ViewListRoundedIcon fontSize="small" /> },
  { id: 'table', label: 'Table', icon: <TableRowsRoundedIcon fontSize="small" /> },
  { id: 'thumbnails', label: 'Thumbs', icon: <ViewComfyRoundedIcon fontSize="small" /> },
];

export function ConfigurationActionButton({ label, onClick }: ConfigurationActionButtonProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`${label} menu`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        className="inline-grid size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] text-[var(--vestara-accent-text)] transition-colors hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] [&_svg]:size-4"
      >
        <MoreVertRoundedIcon aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-[var(--vestara-z-index-popover)] mt-[var(--vestara-spacing-element)] min-w-44 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] p-[var(--vestara-spacing-element)] shadow-[var(--vestara-elevation-md)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onClick();
            }}
            className="flex min-h-8 w-full items-center rounded-[var(--vestara-radius)] px-[var(--vestara-spacing-element)] text-left text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)] transition-colors hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)]"
          >
            {label}
          </button>
        </div>
      )}
    </div>
  );
}

function FactIcon({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const icon =
    normalized.includes('event') || normalized.includes('updated') ? (
      <EventNoteRoundedIcon />
    ) : normalized.includes('file') || normalized.includes('scope') || normalized.includes('workspace') ? (
      <FolderOpenRoundedIcon />
    ) : normalized.includes('provider') || normalized.includes('model') || normalized.includes('agent') ? (
      <AutoAwesomeRoundedIcon />
    ) : normalized.includes('revision') || normalized.includes('version') || normalized.includes('count') ? (
      <DataObjectRoundedIcon />
    ) : (
      <TuneRoundedIcon />
    );

  return (
    <span aria-hidden="true" className="shrink-0 text-[var(--vestara-accent-text)] [&_svg]:size-4">
      {icon}
    </span>
  );
}

function FactRows({ facts }: { facts: readonly ConfigurationFact[] }) {
  return (
    <div>
      {facts.map((fact) => (
        <div
          key={fact.label}
          title={fact.title}
          className="flex min-w-0 items-center gap-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius)] border-t border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] px-[var(--vestara-spacing-element)] py-[var(--vestara-spacing-element)] first:border-t-0"
        >
          <FactIcon label={fact.label} />
          <span className="min-w-0 flex-1 truncate text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
            {fact.label}
          </span>
          <span className="min-w-0 shrink-0 text-right text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)]">
            {fact.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function FactInline({ facts }: { facts: readonly ConfigurationFact[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-[var(--vestara-spacing-element)]">
      {facts.map((fact) => (
        <span
          key={fact.label}
          title={fact.title}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] px-2 py-1 text-[var(--vestara-font-size-xs)]"
        >
          <FactIcon label={fact.label} />
          <span className="text-[var(--vestara-text-muted)]">{fact.label}</span>
          <span className="min-w-0 truncate text-[var(--vestara-text-primary)]">{fact.value}</span>
        </span>
      ))}
    </div>
  );
}

function ItemHeader({ item }: { item: ConfigurationItem }) {
  return (
    <div className="flex min-w-0 items-start gap-[var(--vestara-spacing-element)]">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] text-[var(--vestara-accent-text)] shadow-[var(--vestara-elevation-sm)] [&_svg]:size-[18px]"
      >
        {item.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-text-primary)]">
            {item.title}
          </h3>
          {item.badge}
        </div>
        <p className="mt-[var(--vestara-spacing-element)] text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function CardsView({ items }: { items: readonly ConfigurationItem[] }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-[var(--vestara-spacing-section)] md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <WorkspaceOperationalPanel
          key={item.id}
          title={item.title}
          description={item.description}
          icon={item.icon}
          tone={item.tone}
          className="transition-[border-color,box-shadow] duration-200 hover:border-[var(--vestara-accent-border-hover)] hover:shadow-[var(--vestara-elevation-md)]"
          actions={
            <div className="flex items-center gap-[var(--vestara-spacing-element)]">
              {item.badge}
              {item.action}
            </div>
          }
        >
          <FactRows facts={item.facts} />
        </WorkspaceOperationalPanel>
      ))}
    </div>
  );
}

export function ConfigurationThumbnailView({ items }: { items: readonly ConfigurationItem[] }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-[var(--vestara-spacing-section)] md:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.id}
          className="group relative min-w-0 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] p-[var(--vestara-spacing-section)] transition-[background-color,border-color,box-shadow] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:shadow-[var(--vestara-elevation-md)]"
        >
          <div className="flex items-start justify-between gap-[var(--vestara-spacing-element)]">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-accent-text)] shadow-[var(--vestara-elevation-sm)] [&_svg]:size-6"
            >
              {item.icon}
            </span>
            {item.action}
          </div>
          <div className="mt-[var(--vestara-spacing-section)] min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                {item.title}
              </h3>
              {item.badge}
            </div>
            <p className="mt-[var(--vestara-spacing-element)] line-clamp-2 min-h-10 text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
              {item.description}
            </p>
          </div>
          <div className="mt-[var(--vestara-spacing-section)] min-w-0">
            <FactInline facts={item.facts.slice(0, 2)} />
          </div>
        </article>
      ))}
    </div>
  );
}

function ListView({ items }: { items: readonly ConfigurationItem[] }) {
  return (
    <div className="st-panel divide-y divide-[var(--vestara-accent-border)] overflow-hidden border border-[var(--vestara-accent-border)] shadow-[var(--vestara-elevation-md)]">
      {items.map((item) => (
        <article
          key={item.id}
          className="group grid min-w-0 gap-[var(--vestara-spacing-element)] p-[var(--vestara-spacing-section)] transition-[background-color,border-color] hover:bg-[var(--vestara-accent-bg)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        >
          <div className="min-w-0">
            <ItemHeader item={item} />
            <div className="mt-[var(--vestara-spacing-section)] min-w-0">
              <FactInline facts={item.facts} />
            </div>
          </div>
          {item.action && <div className="justify-self-start lg:justify-self-end">{item.action}</div>}
        </article>
      ))}
    </div>
  );
}

function TableView({ items }: { items: readonly ConfigurationItem[] }) {
  return (
    <div className="st-panel min-w-0 overflow-hidden border border-[var(--vestara-accent-border)] shadow-[var(--vestara-elevation-md)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--vestara-accent-overlay)]">
            <tr className="border-b border-[var(--vestara-accent-border)] text-[var(--vestara-font-size-xs)] uppercase tracking-wide text-[var(--vestara-text-muted)]">
              <th
                scope="col"
                className="px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] font-medium"
              >
                Domain
              </th>
              <th
                scope="col"
                className="px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] font-medium"
              >
                Description
              </th>
              <th
                scope="col"
                className="px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] font-medium"
              >
                Current values
              </th>
              <th
                scope="col"
                className="px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] font-medium"
              >
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="group border-b border-[var(--vestara-accent-border)] align-middle transition-[background-color,border-color] odd:bg-[var(--vestara-accent-overlay)]/40 hover:bg-[var(--vestara-accent-bg)] last:border-b-0"
              >
                <td className="max-w-52 whitespace-nowrap px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)]">
                  <div className="flex min-w-0 items-center gap-[var(--vestara-spacing-element)]">
                    <span aria-hidden="true" className="text-[var(--vestara-accent-text)] [&_svg]:size-5">
                      {item.icon}
                    </span>
                    <span className="font-medium text-[var(--vestara-text-primary)]">{item.title}</span>
                    {item.badge}
                  </div>
                </td>
                <td className="max-w-72 truncate whitespace-nowrap px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
                  {item.description}
                </td>
                <td className="min-w-0 whitespace-nowrap px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)]">
                  <FactInline facts={item.facts} />
                </td>
                <td className="px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] text-right">
                  {item.action}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ConfigurationView({ items, mode, onModeChange }: ConfigurationViewProps) {
  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          Choose a view for scanning workspace configuration.
        </p>
        <fieldset className="inline-flex shrink-0 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-overlay)] p-[var(--vestara-spacing-element)] shadow-[var(--vestara-elevation-sm)]">
          <legend className="sr-only">Configuration view</legend>
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={mode === option.id}
              onClick={() => onModeChange(option.id)}
              className={`inline-flex min-h-8 items-center gap-[var(--vestara-spacing-element)] rounded-[var(--vestara-radius)] px-[var(--vestara-spacing-section)] text-[var(--vestara-font-size-xs)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-border-focus)] ${
                mode === option.id
                  ? 'border border-[var(--vestara-accent-border-active)] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-text-primary)]'
                  : 'border border-transparent text-[var(--vestara-text-muted)] hover:border-[var(--vestara-accent-border)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text)]'
              }`}
            >
              {option.icon}
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          ))}
        </fieldset>
      </div>
      {mode === 'cards' && <CardsView items={items} />}
      {mode === 'list' && <ListView items={items} />}
      {mode === 'table' && <TableView items={items} />}
      {mode === 'thumbnails' && <ConfigurationThumbnailView items={items} />}
    </div>
  );
}
