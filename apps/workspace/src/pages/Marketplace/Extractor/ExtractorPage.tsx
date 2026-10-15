/**
 * VESTARA Extractor — Phase 2/3 lab (Drop → Parse → Inspect → Edit → Export).
 *
 * 3-panel layout (Header + Sidebar + Main + Inspector) plus Export section
 * and Cmd+K CommandPalette. Reference fixtures are read-only; parsed
 * artifacts open a working set with editable props, rename/duplicate/
 * delete, live preview, and ZIP/barrel export.
 *
 * Governance: tokens only (`var(--vestara-*)` + shared `styles.js`).
 * No hex literals, no `bg-[#...]`, no hardcoded arrays in JSX.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToasts } from '../../../components/Toast.js';
import { button, buttonPrimary, chip, input, muted, panel, panelBody, panelHeader } from '../styles.js';
import CodeViewer from './CodeViewer.js';
import CommandPalette, { type PaletteActionId } from './CommandPalette.js';
import ComponentPreview from './ComponentPreview.js';
import ExportSection from './ExportSection.js';
import {
  EXTRACTOR_COMPONENT_FIXTURES,
  EXTRACTOR_FILTERS,
  EXTRACTOR_MANIFEST_FIXTURE,
  EXTRACTOR_TOKENS_FIXTURE,
} from './extractor.fixtures.js';
import { buildFileList, buildZip, downloadBlob } from './exportLib.js';
import { parseArtifactHtml } from './parseArtifact.js';
import type { ExtractedComponent, ExtractedProp, ExtractionResult, ExtractorCategory } from './types.js';

type FilterId = ExtractorCategory | 'all';
type CenterView = 'preview' | 'original' | 'clean';

interface EditStats {
  changed: number;
  added: number;
  removed: number;
  changes: string[];
}

function matchesFilter(c: ExtractedComponent, filter: FilterId, query: string): boolean {
  if (filter !== 'all' && c.category !== filter) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${c.name} ${c.file} ${c.description} ${c.varName}`.toLowerCase().includes(q);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadText(filename: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

const CENTER_VIEWS: { id: CenterView; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'original', label: 'Original' },
  { id: 'clean', label: 'Clean' },
];

const ACTION_LABELS = ['Open', 'Download', 'Copy Path', 'Rename', 'Duplicate', 'Delete'];

export default function ExtractorPage() {
  const { addToast } = useToasts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ExtractionResult | null>(null);
  const [comps, setComps] = useState<ExtractedComponent[] | null>(null);
  const [stats, setStats] = useState<Record<string, EditStats>>({});
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [tabs, setTabs] = useState<string[]>(['components/FileIcon.tsx']);
  const [activePath, setActivePath] = useState('components/FileIcon.tsx');
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState<CenterView>('preview');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [newPropName, setNewPropName] = useState('');
  const [showDiff, setShowDiff] = useState(false);

  const usingFixtures = comps === null;
  const components: readonly ExtractedComponent[] = comps ?? EXTRACTOR_COMPONENT_FIXTURES;
  const bundleKb = parsed?.bundleKb ?? 342;
  const cssKb = parsed?.cssKb ?? 18;
  const manifest = parsed?.manifestJson ?? EXTRACTOR_MANIFEST_FIXTURE;
  const tokensCss = parsed?.tokensCss ?? EXTRACTOR_TOKENS_FIXTURE;

  const visible = useMemo(() => components.filter((c) => matchesFilter(c, filter, query)), [components, filter, query]);
  const active: ExtractedComponent | undefined = useMemo(
    () => components.find((c) => `components/${c.file}` === activePath) ?? visible[0],
    [components, activePath, visible],
  );
  const activeStats = active ? stats[active.id] : undefined;
  const isModified = !!activeStats && activeStats.changed + activeStats.added + activeStats.removed > 0;
  const breadcrumb = active ? `components / ${active.file}` : 'components / —';
  const fwText = useMemo(() => {
    if (!parsed || usingFixtures) return '';
    const parts: string[] = [];
    if (parsed.frameworks.react) parts.push(`React ${parsed.frameworks.react}`);
    if (parsed.frameworks.tailwind) parts.push(`TW ${parsed.frameworks.tailwind}`);
    return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
  }, [parsed, usingFixtures]);

  const categoryStats = useMemo(() => {
    const counts = { all: components.length, code: 0, docs: 0, ui: 0 };
    for (const c of components) counts[c.category] += 1;
    return counts;
  }, [components]);

  function syncUrl(path: string): void {
    try {
      const next = new URL(window.location.href);
      next.searchParams.set('file', path);
      window.history.replaceState(null, '', next);
    } catch {
      // Non-browser or restricted context — deep-links simply stay off.
    }
  }

  function openPath(path: string): void {
    setActivePath(path);
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setRenaming(false);
    setShowDiff(false);
    syncUrl(path);
  }

  // Deep-link (?file=) on first mount against the reference set.
  useEffect(() => {
    try {
      const file = new URLSearchParams(window.location.search).get('file');
      if (!file) return;
      const path = file.startsWith('components/') ? file : `components/${file}`;
      if (EXTRACTOR_COMPONENT_FIXTURES.some((c) => `components/${c.file}` === path)) openPath(path);
    } catch {
      // Ignore — deep-links stay off.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cmd+K / Ctrl+K opens the palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function ingest(text: string, label: string): void {
    const result = parseArtifactHtml(text);
    setParsed(result);
    if (result.components.length === 0) {
      setComps(null);
      setStats({});
      addToast({
        type: 'warning',
        title: 'Artifact parsed',
        message: `No known components in ${label} — showing reference examples.`,
      });
      return;
    }
    setComps([...result.components]);
    setStats({});
    const first = result.components[0];
    if (first) {
      const path = `components/${first.file}`;
      setTabs([path]);
      setActivePath(path);
      syncUrl(path);
    }
    addToast({
      type: 'success',
      title: 'Artifact parsed',
      message: `Parsed ${result.componentCount} components from ${label}.`,
    });
  }

  async function handleFile(file: File): Promise<void> {
    ingest(await file.text(), file.name);
  }

  async function handleUrl(): Promise<void> {
    const target = url.trim();
    if (!target) return;
    setUrlBusy(true);
    try {
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ingest(await res.text(), target);
      setUrl('');
    } catch {
      addToast({ type: 'error', message: 'URL fetch failed (CORS or network). Try a file drop instead.' });
    } finally {
      setUrlBusy(false);
    }
  }

  function closeTab(path: string): void {
    setTabs((prev) => {
      const next = prev.filter((t) => t !== path);
      if (activePath === path && next.length > 0) setActivePath(next[next.length - 1] ?? '');
      return next;
    });
  }

  function recordStat(id: string, kind: 'changed' | 'added' | 'removed', note: string): void {
    setStats((prev) => {
      const cur = prev[id] ?? { changed: 0, added: 0, removed: 0, changes: [] };
      return { ...prev, [id]: { ...cur, [kind]: cur[kind] + 1, changes: [...cur.changes, note].slice(-20) } };
    });
  }

  function updateActive(fn: (c: ExtractedComponent) => ExtractedComponent): void {
    if (!active || usingFixtures) return;
    setComps((prev) => prev?.map((c) => (c.id === active.id ? fn(c) : c)) ?? null);
  }

  function editProp(index: number, patch: Partial<ExtractedProp>): void {
    if (!active) return;
    const row = active.props[index];
    if (!row) return;
    updateActive((c) => ({ ...c, props: c.props.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
    const changedKeys = Object.keys(patch).join(',');
    recordStat(active.id, 'changed', `${row.name}.${changedKeys} edited`);
  }

  function removeProp(index: number): void {
    if (!active) return;
    const row = active.props[index];
    if (!row) return;
    updateActive((c) => ({ ...c, props: c.props.filter((_, i) => i !== index) }));
    recordStat(active.id, 'removed', `${row.name} removed`);
  }

  function addProp(): void {
    const name = newPropName.trim();
    if (!active || !name) return;
    if (active.props.some((p) => p.name === name)) {
      addToast({ type: 'warning', message: `Prop ${name} already exists.` });
      return;
    }
    updateActive((c) => ({
      ...c,
      props: [...c.props, { name, type: 'unknown', defaultValue: '—', description: 'Added in Component Lab.' }],
    }));
    recordStat(active.id, 'added', `${name} added`);
    setNewPropName('');
  }

  function commitRename(): void {
    if (!active) return;
    const name = renameValue.trim().replace(/\s+/g, '');
    if (!name) {
      addToast({ type: 'error', message: 'Name cannot be empty.' });
      return;
    }
    const oldPath = `components/${active.file}`;
    const file = `${name}.tsx`;
    const nextPath = `components/${file}`;
    updateActive((c) => ({ ...c, name, file }));
    recordStat(active.id, 'changed', `renamed to ${name}`);
    setTabs((prev) => prev.map((t) => (t === oldPath ? nextPath : t)));
    setActivePath(nextPath);
    syncUrl(nextPath);
    setRenaming(false);
    addToast({ type: 'success', message: `Renamed to ${name}.` });
  }

  function duplicateActive(): void {
    if (!active) return;
    const base = active.file.replace(/\.tsx$/, '');
    const copy: ExtractedComponent = {
      ...active,
      id: `${active.id}-copy-${Date.now()}`,
      name: `${active.name}Copy`,
      file: `${base}Copy.tsx`,
      description: `${active.description} (duplicate)`,
      props: active.props.map((p) => ({ ...p })),
    };
    setComps((prev) => (prev ? [...prev, copy] : prev));
    const path = `components/${copy.file}`;
    setTabs((prev) => [...prev, path]);
    setActivePath(path);
    syncUrl(path);
    addToast({ type: 'success', message: `Duplicated as ${copy.name}.` });
  }

  function deleteActive(): void {
    if (!active) return;
    const path = `components/${active.file}`;
    setComps((prev) => prev?.filter((c) => c.id !== active.id) ?? null);
    setStats((prev) => {
      const next = { ...prev };
      delete next[active.id];
      return next;
    });
    setTabs((prev) => {
      const next = prev.filter((t) => t !== path);
      if (activePath === path && next.length > 0) setActivePath(next[next.length - 1] ?? '');
      return next;
    });
    addToast({ type: 'info', message: `Deleted ${active.name}. Drop the artifact again to restore.` });
  }

  function guardReadonly(): boolean {
    if (usingFixtures) {
      addToast({ type: 'info', message: 'Reference examples are read-only — drop an artifact to edit.' });
      return true;
    }
    return false;
  }

  function handleGridAction(label: string): void {
    if (!active) return;
    switch (label) {
      case 'Open':
        openPath(`components/${active.file}`);
        break;
      case 'Download':
        downloadText(active.file, active.source.clean);
        addToast({ type: 'success', message: `${active.file} downloaded.` });
        break;
      case 'Copy Path':
        void copyText(`components/${active.file}`).then((ok) =>
          addToast({ type: ok ? 'success' : 'error', message: ok ? 'Path copied.' : 'Copy failed.' }),
        );
        break;
      case 'Rename':
        if (guardReadonly()) break;
        setRenameValue(active.name);
        setRenaming(true);
        break;
      case 'Duplicate':
        if (guardReadonly()) break;
        duplicateActive();
        break;
      case 'Delete':
        if (guardReadonly()) break;
        deleteActive();
        break;
      default:
        break;
    }
  }

  function handlePaletteAction(action: PaletteActionId): void {
    switch (action) {
      case 'extract-all':
        setFilter('all');
        setQuery('');
        addToast({ type: 'info', message: `Showing all ${components.length} components.` });
        break;
      case 'export-react':
        if (components.length === 0) {
          addToast({ type: 'warning', message: 'Nothing to export yet.' });
          break;
        }
        void buildZip(buildFileList(components, 'react', tokensCss, manifest, true))
          .then((bytes) => {
            downloadBlob('vestara-ui-extract.zip', new Blob([new Uint8Array(bytes)], { type: 'application/zip' }));
            addToast({ type: 'success', message: `Exported ${components.length} components as React.` });
          })
          .catch(() => addToast({ type: 'error', message: 'Export failed.' }));
        break;
      case 'copy-tokens':
        void copyText(tokensCss).then((ok) => addToast({ type: ok ? 'success' : 'error', message: ok ? 'Tokens copied.' : 'Copy failed.' }));
        break;
      default:
        break;
    }
  }

  return (
    <div className="space-y-3">
      {/* Header (56px) — stats + actions */}
      <div className={`${panel} flex h-14 items-center justify-between gap-3 px-4`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--vestara-status-success)]" aria-label="live" />
          <span className="truncate text-sm font-semibold text-[var(--vestara-text-primary)]">VESTARA / EXTRACTOR</span>
          <span className={`hidden truncate text-xs sm:inline ${muted}`}>
            Bundle {bundleKb}KB | CSS {cssKb}KB |{' '}
            {usingFixtures ? `${components.length} reference components` : `${components.length} components found`}
            {fwText}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={button} onClick={() => setPaletteOpen(true)}>
            Command K
          </button>
          <button type="button" className={button} onClick={() => fileRef.current?.click()}>
            Drop artifact…
          </button>
          <button
            type="button"
            className={buttonPrimary}
            onClick={() => {
              downloadText('manifest.json', manifest);
              addToast({ type: 'success', message: 'manifest.json downloaded.' });
            }}
          >
            Export manifest
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className={`${panel} flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2`}>
        <span className={`text-xs ${muted}`}>
          <span className="font-semibold text-[var(--vestara-text-primary)]">{categoryStats.all}</span> components
        </span>
        <span className={`text-xs ${muted}`}>
          <span className="font-semibold text-[var(--vestara-status-info)]">{categoryStats.code}</span> code
        </span>
        <span className={`text-xs ${muted}`}>
          <span className="font-semibold text-[var(--vestara-status-warning)]">{categoryStats.docs}</span> docs
        </span>
        <span className={`text-xs ${muted}`}>
          <span className="font-semibold text-[var(--vestara-status-success)]">{categoryStats.ui}</span> ui
        </span>
        {parsed && !usingFixtures && (
          <span className={`ml-auto text-xs ${muted}`}>
            {parsed.unmappedVarCount} unmapped vars
          </span>
        )}
      </div>

      {usingFixtures && (
        <div
          className={`${panel} ${panelBody} border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)]`}
        >
          <p className="text-xs text-[var(--vestara-status-warning)]">
            Reference examples — drop <span className="font-semibold">artifact.html</span> below to replace with live
            extraction. Nothing here is presented as parsed output.
          </p>
        </div>
      )}

      {/* Drop zone + URL ingest */}
      <div
        className={`${panel} ${panelBody} border-dashed text-center ${
          dragOver ? 'border-[var(--vestara-accent-border-active)]' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <p className="text-sm font-medium text-[var(--vestara-text-primary)]">Drop React artifact HTML here</p>
        <p className={`mt-1 text-xs ${muted}`}>
          Client-side only — parsed in your browser, never uploaded. File drop or paste a URL.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".html,text/html"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        <div className="mx-auto mt-3 flex max-w-[520px] flex-col gap-2 sm:flex-row">
          <button type="button" className={`${button} shrink-0`} onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleUrl();
            }}
            placeholder="…or paste artifact URL and press Enter"
            aria-label="Artifact URL"
            className={input}
          />
          <button type="button" className={`${button} shrink-0`} disabled={urlBusy} onClick={() => void handleUrl()}>
            {urlBusy ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      </div>

      {/* 3 panels */}
      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Left sidebar — Component Index (TreeNode + FilterChips + SearchInput) */}
        <section className={`${panel} w-full shrink-0 lg:w-70`} aria-label="Component index">
          <div className={panelHeader}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
              Component index — {visible.length}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXTRACTOR_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`${chip} ${filter === f.id ? 'border-[var(--vestara-accent-border-active)] text-[var(--vestara-accent-text)]' : muted}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter..."
              aria-label="Filter components"
              className={`${input} mt-2`}
            />
          </div>
          <ul className="max-h-96 overflow-auto p-2">
            <li className={`px-2 py-1 text-xs font-medium ${muted}`}>components/</li>
            {visible.map((c) => {
              const path = `components/${c.file}`;
              const isActive = path === activePath;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openPath(path)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                      isActive
                        ? 'bg-[var(--vestara-surface-interactive)] text-[var(--vestara-text-primary)]'
                        : 'text-[var(--vestara-text-secondary)] hover:bg-[var(--vestara-surface-interactive)]'
                    }`}
                  >
                    <span className="text-[var(--vestara-marketplace-primary)]" aria-hidden="true">
                      ◆
                    </span>
                    <span className="truncate">{c.file}</span>
                    <span className={`ml-auto shrink-0 ${muted}`}>{c.sizeKb}k</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className={`px-2 py-4 text-center text-xs ${muted}`}>No matches.</li>}
            <li className={`px-2 py-1 pt-3 text-xs font-medium ${muted}`}>tokens.css · manifest.json</li>
          </ul>
        </section>

        {/* Center — TabBar + Breadcrumb + Preview/CodeViewer */}
        <section className={`${panel} min-w-0 flex-1`} aria-label="Code viewer">
          <div className={`${panelHeader} flex items-center gap-1 overflow-x-auto`}>
            {tabs.map((t) => (
              <span
                key={t}
                className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                  t === activePath
                    ? 'border-[var(--vestara-accent-border-active)] text-[var(--vestara-text-primary)]'
                    : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
                }`}
              >
                <button type="button" onClick={() => setActivePath(t)} className="max-w-40 truncate">
                  {t.replace('components/', '')}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${t}`}
                  onClick={() => closeTab(t)}
                  className="text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div
            className={`flex items-center justify-between gap-2 border-b border-[var(--vestara-border-subtle)] px-4 py-1.5 text-xs ${muted}`}
          >
            <span className="truncate">{breadcrumb}</span>
            <span className="flex shrink-0 gap-1">
              {CENTER_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded px-1.5 py-0.5 font-mono ${
                    view === v.id ? 'text-[var(--vestara-accent-text)]' : ''
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </span>
          </div>
          {active ? (
            view === 'preview' ? (
              <div className={`${panelBody}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] px-2 py-0.5 font-mono text-xs text-[var(--vestara-status-success)]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vestara-status-success)]" />
                    LIVE
                  </span>
                  <span className={`text-xs ${muted}`}>Preview updates as you edit props</span>
                </div>
                <ComponentPreview component={active} path={activePath} modified={isModified} />
              </div>
            ) : (
              <div className="grid gap-0 lg:grid-cols-2">
                <div className="min-w-0 border-b border-[var(--vestara-border-subtle)] lg:border-b-0 lg:border-r">
                  <h3 className="border-b border-[var(--vestara-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--vestara-text-secondary)]">
                    Original (minified)
                  </h3>
                  <CodeViewer code={active.source.original} />
                </div>
                <div className="min-w-0">
                  <h3 className="border-b border-[var(--vestara-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--vestara-text-secondary)]">
                    Clean (TypeScript)
                  </h3>
                  <CodeViewer code={active.source.clean} />
                </div>
              </div>
            )
          ) : (
            <p className={`p-6 text-center text-sm ${muted}`}>Select a component to inspect.</p>
          )}
          <div className={`${panelBody} border-t border-[var(--vestara-border-subtle)]`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
              tokens.css
            </h3>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-3 font-mono text-xs text-[var(--vestara-text-secondary)]">
              {tokensCss}
            </pre>
          </div>
        </section>

        {/* Right inspector — DetailCard + PropTable + CodeBlock + ActionGrid */}
        <aside className={`${panel} w-full shrink-0 lg:w-80`} aria-label="Inspector">
          {active ? (
            <>
              <div className={panelHeader}>
                {renaming ? (
                  <div className="flex gap-1.5">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenaming(false);
                      }}
                      autoFocus
                      aria-label="New component name"
                      className={input}
                    />
                    <button type="button" className={buttonPrimary} onClick={commitRename}>
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)]">{active.name}</h2>
                    <p className={`mt-0.5 text-xs ${muted}`}>
                      {active.category} · {active.sizeKb}KB · components/{active.file}
                    </p>
                  </>
                )}
              </div>
              <div className={`${panelBody} space-y-4`}>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
                    Props{usingFixtures ? '' : ' (editable)'}
                  </h3>
                  {active.props.length === 0 ? (
                    <p className={`mt-1 text-xs ${muted}`}>No props detected.</p>
                  ) : usingFixtures ? (
                    <table className="mt-1 w-full border-collapse text-xs">
                      <thead>
                        <tr className={`border-b border-[var(--vestara-border-subtle)] text-left ${muted}`}>
                          <th className="py-1 pr-2 font-medium">prop</th>
                          <th className="py-1 pr-2 font-medium">type</th>
                          <th className="py-1 font-medium">default</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.props.map((p) => (
                          <tr key={p.name} className="border-b border-[var(--vestara-border-subtle)] last:border-0">
                            <td className="py-1 pr-2 text-[var(--vestara-text-primary)]">{p.name}</td>
                            <td className="py-1 pr-2 text-[var(--vestara-status-info)]">{p.type}</td>
                            <td className="py-1 text-[var(--vestara-text-muted)]">{p.defaultValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <>
                      <table className="mt-1 w-full border-collapse text-xs">
                        <tbody>
                          {active.props.map((p, i) => (
                            <tr key={`${p.name}-${i}`} className="border-b border-[var(--vestara-border-subtle)] last:border-0">
                              <td className="py-1 pr-1">
                                <input
                                  value={p.name}
                                  onChange={(e) => editProp(i, { name: e.target.value })}
                                  aria-label={`Prop ${i} name`}
                                  className={`${input} px-1.5 py-1 font-mono text-xs`}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  value={p.type}
                                  onChange={(e) => editProp(i, { type: e.target.value })}
                                  aria-label={`${p.name} type`}
                                  className={`${input} px-1.5 py-1 font-mono text-xs`}
                                />
                              </td>
                              <td className="py-1 pl-1">
                                <div className="flex items-center gap-1">
                                  <input
                                    value={p.defaultValue}
                                    onChange={(e) => editProp(i, { defaultValue: e.target.value })}
                                    aria-label={`${p.name} default`}
                                    className={`${input} px-1.5 py-1 font-mono text-xs`}
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Delete prop ${p.name}`}
                                    onClick={() => removeProp(i)}
                                    className="shrink-0 text-[var(--vestara-text-muted)] hover:text-[var(--vestara-status-error)]"
                                  >
                                    ×
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 flex gap-1.5">
                        <input
                          value={newPropName}
                          onChange={(e) => setNewPropName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addProp();
                          }}
                          placeholder="new-prop-name"
                          aria-label="New prop name"
                          className={`${input} px-2 py-1 font-mono text-xs`}
                        />
                        <button type="button" className={`${button} shrink-0`} onClick={addProp}>
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
                    Import
                  </h3>
                  <pre className="mt-1 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-2 font-mono text-xs text-[var(--vestara-text-secondary)]">
                    {`import ${active.name} from './components/${active.file}';`}
                  </pre>
                  <button
                    type="button"
                    className={`${button} mt-2 w-full`}
                    onClick={() =>
                      void copyText(`import ${active.name} from './components/${active.file}';`).then((ok) =>
                        addToast({ type: ok ? 'success' : 'error', message: ok ? 'Import copied.' : 'Copy failed.' }),
                      )
                    }
                  >
                    Copy import
                  </button>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
                    Actions
                  </h3>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {ACTION_LABELS.map((label) => (
                      <button key={label} type="button" className={button} onClick={() => handleGridAction(label)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`rounded-md border border-[var(--vestara-border-subtle)] px-2 py-1.5 text-xs ${muted}`}>
                  <p>
                    Extraction status: {usingFixtures ? 'reference-example' : isModified ? 'modified' : 'clean'} · var{' '}
                    {active.varName}
                  </p>
                  {!usingFixtures && isModified && activeStats && (
                    <p className="mt-0.5">
                      {activeStats.changed + activeStats.added} insertions, {activeStats.removed} deletions ·{' '}
                      <button type="button" className="underline" onClick={() => setShowDiff((v) => !v)}>
                        {showDiff ? 'Hide diff' : 'View diff'}
                      </button>
                    </p>
                  )}
                  {showDiff && activeStats && (
                    <ul className="mt-1 space-y-0.5 font-mono">
                      {activeStats.changes.map((c, i) => (
                        <li key={i}>· {c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className={`p-6 text-center text-sm ${muted}`}>Nothing selected.</p>
          )}
        </aside>
      </div>

      {/* Screen 4 — Export */}
      <ExportSection
        components={components}
        tokensCss={tokensCss}
        manifestJson={manifest}
        onToast={(message) => addToast({ type: 'success', message })}
        onCopy={copyText}
      />

      <CommandPalette
        open={paletteOpen}
        components={components}
        onOpenFile={openPath}
        onAction={handlePaletteAction}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
