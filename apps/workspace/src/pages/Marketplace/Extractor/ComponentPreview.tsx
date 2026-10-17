/**
 * VESTARA Extractor — live component preview (Phase 2).
 *
 * Governed mini-renderers for the extracted primitives, driven by the
 * component's *current* prop values — editing a prop default in the
 * PropTable re-renders the preview instantly. Unknown components fall back
 * to a prop-chip card rather than a fabricated mock.
 */

import { EXTRACTOR_FILTERS } from './extractor.fixtures.js';
import type { ExtractedComponent } from './types.js';

function propDefault(component: ExtractedComponent, name: string): string | null {
  const hit = component.props.find((p) => p.name === name);
  if (!hit || hit.defaultValue === '—' || hit.defaultValue === '') return null;
  return hit.defaultValue.replace(/^["']|["']$/g, '');
}

const FILE_GLYPHS: Record<string, { glyph: string; token: string }> = {
  folder: { glyph: '▤', token: 'text-[var(--vestara-status-success)]' },
  code: { glyph: '</>', token: 'text-[var(--vestara-status-info)]' },
  docs: { glyph: '≡', token: 'text-[var(--vestara-status-warning)]' },
  config: { glyph: '{ }', token: 'text-[var(--vestara-text-muted)]' },
  data: { glyph: '▦', token: 'text-[var(--vestara-status-tool)]' },
};

interface PreviewProps {
  readonly component: ExtractedComponent;
  readonly path: string;
  readonly modified: boolean;
}

function FileIconPreview({ component }: PreviewProps) {
  const category = propDefault(component, 'category') ?? 'other';
  const face = FILE_GLYPHS[category] ?? { glyph: '○', token: 'text-[var(--vestara-text-muted)]' };
  return (
    <div className="flex items-center gap-3">
      <span className={`font-mono text-2xl ${face.token}`} aria-hidden="true">
        {face.glyph}
      </span>
      <div>
        <div className="text-sm font-medium text-[var(--vestara-text-primary)]">{component.name}</div>
        <div className="font-mono text-xs text-[var(--vestara-text-muted)]">category=&quot;{category}&quot;</div>
      </div>
    </div>
  );
}

function FilterChipsPreview({ component }: PreviewProps) {
  const active = propDefault(component, 'value') ?? 'all';
  return (
    <div className="flex flex-wrap gap-1.5">
      {EXTRACTOR_FILTERS.map((f) => (
        <span
          key={f.id}
          className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
            active === f.id
              ? 'border-[var(--vestara-accent-border-active)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]'
              : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
          }`}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

function SearchInputPreview({ component }: PreviewProps) {
  return (
    <div className="rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3 py-2 text-sm text-[var(--vestara-text-muted)]">
      {propDefault(component, 'placeholder') ?? 'Search...'}
    </div>
  );
}

function ToastPreview({ component }: PreviewProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--vestara-accent-border-active)] bg-[var(--vestara-surface-panel)] px-4 py-2.5 text-xs text-[var(--vestara-text-primary)]">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vestara-status-success)]" />
      {propDefault(component, 'message') ?? 'Preview toast'}
    </div>
  );
}

function TabBarPreview({ path }: PreviewProps) {
  // Mirrors the real TabBar API (tabs / active / onActive / onClose):
  // active file derived from the open tab path, with teal dot + close ×.
  const tabs = ['FileIcon.tsx', 'TreeNode.tsx', 'TabBar.tsx'];
  const activeFile = path.split('/').pop() ?? tabs[0];
  return (
    <div className="flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t === activeFile || (t === tabs[0] && !tabs.includes(activeFile));
        return (
          <span
            key={t}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs ${
              isActive
                ? 'border-[var(--vestara-accent-border-active)] text-[var(--vestara-text-primary)]'
                : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
            }`}
          >
            <span aria-hidden="true">▤</span>
            <span className="max-w-40 truncate">{t}</span>
            {isActive && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--vestara-accent-border-active)]"
                aria-label="active"
              />
            )}
            <span aria-hidden="true">×</span>
          </span>
        );
      })}
    </div>
  );
}

function TreeNodePreview({ component }: PreviewProps) {
  // Mirrors the real TreeNode API (node / depth / activePath / expandedPaths):
  // 14px depth indent, chevron, and active teal row.
  const depth = Number(propDefault(component, 'depth') ?? 1);
  return (
    <div className="w-full max-w-[320px] space-y-0.5">
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-[var(--vestara-text-muted)]">
        <span aria-hidden="true">▾</span>
        <span>components/</span>
      </div>
      {[0, 1].map((i) => {
        const isActive = i === 0;
        return (
          <div
            key={i}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs ${
              isActive
                ? 'bg-[var(--vestara-surface-interactive)] text-[var(--vestara-text-primary)]'
                : 'text-[var(--vestara-text-secondary)]'
            }`}
            style={{ paddingLeft: `${8 + (depth + i) * 14}px` }}
          >
            <span aria-hidden="true">{isActive ? '▸' : '·'}</span>
            <span className="truncate">{i === 0 ? component.file : 'TreeNode.tsx'}</span>
            {isActive && (
              <span className="ml-auto shrink-0 text-[var(--vestara-text-muted)]">active</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CommandPalettePreview({ component }: PreviewProps) {
  // Mirrors the real CommandPalette API (open / query / results / onSelect):
  // backdrop-blur modal, indexed results, ESC to close.
  const query = propDefault(component, 'query') ?? '';
  return (
    <div className="w-full max-w-[360px] rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-2 shadow-[var(--vestara-elevation-md)]">
      <div className="rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3 py-2 font-mono text-xs text-[var(--vestara-text-muted)]">
        {query || 'Type a command…'}
      </div>
      <div className="mt-1 space-y-0.5">
        {['FileIcon.tsx', 'TreeNode.tsx', 'TabBar.tsx'].map((r, i) => (
          <div
            key={r}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-xs ${
              i === 0
                ? 'bg-[var(--vestara-surface-interactive)] text-[var(--vestara-text-primary)]'
                : 'text-[var(--vestara-text-secondary)]'
            }`}
          >
            <span aria-hidden="true">▤</span>
            <span className="truncate">{r}</span>
            <span className="ml-auto shrink-0 text-[var(--vestara-text-muted)]">ui</span>
          </div>
        ))}
      </div>
      <p className="mt-1 px-2 font-mono text-xs text-[var(--vestara-text-disabled)]">ESC to close</p>
    </div>
  );
}

function BreadcrumbPreview({ path }: PreviewProps) {
  return (
    <div className="flex items-center gap-1 font-mono text-xs text-[var(--vestara-text-muted)]">
      {path
        .split('/')
        .filter(Boolean)
        .map((seg, i, all) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            <span className={i === all.length - 1 ? 'text-[var(--vestara-text-primary)]' : ''}>{seg}</span>
          </span>
        ))}
    </div>
  );
}

function DetailCardPreview({ component, path }: PreviewProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-[var(--vestara-accent-text)]">
        ◆
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[var(--vestara-text-primary)]">{component.name}</div>
        <div className="truncate font-mono text-xs text-[var(--vestara-text-muted)]">
          {component.category} · {component.sizeKb}KB · {path}
        </div>
      </div>
    </div>
  );
}

function PropTablePreview({ component }: PreviewProps) {
  if (component.props.length === 0) {
    return <p className="text-xs text-[var(--vestara-text-muted)]">No props detected.</p>;
  }
  return (
    <table className="w-full border-collapse font-mono text-xs">
      <tbody>
        {component.props.map((p) => (
          <tr key={p.name} className="border-b border-[var(--vestara-border-subtle)] last:border-0">
            <td className="py-1 pr-2 text-[var(--vestara-accent-text)]">{p.name}</td>
            <td className="py-1 text-[var(--vestara-text-secondary)]">{p.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CodeBlockPreview({ component }: PreviewProps) {
  return (
    <pre className="whitespace-pre-wrap break-all rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-2 font-mono text-xs text-[var(--vestara-text-secondary)]">
      {`import ${component.name} from './components/${component.file}';`}
    </pre>
  );
}

function ActionGridPreview(_props: PreviewProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {['Open', 'Download', 'Copy Path', 'Rename', 'Duplicate', 'Delete'].map((label) => (
        <span
          key={label}
          className="rounded-md border border-[var(--vestara-border-subtle)] px-2.5 py-1.5 text-center text-xs text-[var(--vestara-text-secondary)]"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function GitStatusPreview({ modified }: PreviewProps) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span
        className={`rounded border px-1.5 py-0.5 ${
          modified
            ? 'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]'
            : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
        }`}
      >
        {modified ? 'modified' : 'clean'}
      </span>
      <span className="text-[var(--vestara-text-muted)]">On branch main</span>
    </div>
  );
}

function CodeViewerPreview({ component }: PreviewProps) {
  const lines = component.source.clean.split('\n').length;
  return (
    <div className="flex gap-3">
      <div className="select-none border-r border-[var(--vestara-border-subtle)] pr-3 text-right font-mono text-xs text-[var(--vestara-text-disabled)]">
        {Array.from({ length: Math.min(lines, 6) }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <p className="font-mono text-xs text-[var(--vestara-text-secondary)]">
        {lines} lines · gutter + minimap in full view
      </p>
    </div>
  );
}

const CATEGORY_TOKEN: Record<string, string> = {
  ui: 'text-[var(--vestara-status-success)]',
  code: 'text-[var(--vestara-status-info)]',
  docs: 'text-[var(--vestara-status-warning)]',
};

function FallbackPreview({ component }: PreviewProps) {
  const token = CATEGORY_TOKEN[component.category] ?? 'text-[var(--vestara-text-muted)]';
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-xs uppercase ${token}`}>{component.category}</span>
        <span className="text-sm font-medium text-[var(--vestara-text-primary)]">{component.name}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--vestara-text-secondary)]">{component.description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {component.props.map((p) => (
          <span
            key={p.name}
            className="rounded border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--vestara-accent-text)]"
          >
            {p.name}
          </span>
        ))}
        {component.props.length === 0 && (
          <span className="font-mono text-xs text-[var(--vestara-text-muted)]">no props</span>
        )}
      </div>
    </div>
  );
}

export default function ComponentPreview({ component, path, modified }: PreviewProps) {
  const props = { component, path, modified };
  switch (component.name) {
    case 'FileIcon':
      return <FileIconPreview {...props} />;
    case 'FilterChips':
      return <FilterChipsPreview {...props} />;
    case 'SearchInput':
      return <SearchInputPreview {...props} />;
    case 'Toast':
      return <ToastPreview {...props} />;
    case 'TabBar':
      return <TabBarPreview {...props} />;
    case 'TreeNode':
      return <TreeNodePreview {...props} />;
    case 'CommandPalette':
      return <CommandPalettePreview {...props} />;
    case 'Breadcrumb':
      return <BreadcrumbPreview {...props} />;
    case 'DetailCard':
      return <DetailCardPreview {...props} />;
    case 'PropTable':
      return <PropTablePreview {...props} />;
    case 'CodeBlock':
      return <CodeBlockPreview {...props} />;
    case 'ActionGrid':
      return <ActionGridPreview {...props} />;
    case 'GitStatusCard':
      return <GitStatusPreview {...props} />;
    case 'CodeViewer':
      return <CodeViewerPreview {...props} />;
    default:
      return <FallbackPreview {...props} />;
  }
}
