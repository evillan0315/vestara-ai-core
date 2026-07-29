import { useState } from 'react';

interface JsonTreeViewProps {
  data: any;
  /** Maximum depth to auto-expand (default 2). Nodes deeper start collapsed. */
  defaultExpandDepth?: number;
  /** Label for the root node. Defaults to "root". */
  label?: string;
}

/** Type annotation badge colors */
const typeStyles: Record<string, string> = {
  string: 'text-green-400 bg-green-400/10',
  number: 'text-blue-400 bg-blue-400/10',
  boolean: 'text-amber-400 bg-amber-400/10',
  null: 'text-zinc-500 bg-zinc-500/10',
  array: 'text-purple-400 bg-purple-400/10',
  object: 'text-cyan-400 bg-cyan-400/10',
};

function getType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function formatPreview(value: any): string {
  const t = getType(value);
  if (t === 'null') return 'null';
  if (t === 'string') {
    const s = String(value);
    return s.length > 50 ? `"${s.slice(0, 50)}…"` : `"${s}"`;
  }
  if (t === 'number' || t === 'boolean') return String(value);
  if (t === 'array') return `Array[${value.length}]`;
  if (t === 'object') {
    const keys = Object.keys(value);
    return `{${keys.length} keys}`;
  }
  return String(value);
}

function formatKey(key: string): string {
  // Simple keys don't need quotes
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key;
  return JSON.stringify(key);
}

function TreeNode({
  value,
  label,
  depth,
  defaultExpandDepth,
  isLast,
}: {
  value: any;
  label: string;
  depth: number;
  defaultExpandDepth: number;
  isLast: boolean;
}) {
  const type = getType(value);
  const [collapsed, setCollapsed] = useState(depth >= defaultExpandDepth);
  const isCollapsible = type === 'object' || type === 'array';
  const hasKeys = isCollapsible && (type === 'array' ? value.length > 0 : Object.keys(value).length > 0);

  const indent = depth * 16;

  // Leaf values — render inline
  if (!isCollapsible || !hasKeys) {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: indent }}>
        <span className="text-(--vestara-text-muted) font-mono text-xs">{formatKey(label)}</span>
        <span className="text-(--vestara-text-muted)">:</span>
        <span className="text-(--vestara-text) font-mono text-xs">
          {type === 'string' ? (
            <span className="text-green-400">&quot;{String(value)}&quot;</span>
          ) : type === 'number' ? (
            <span className="text-blue-400">{String(value)}</span>
          ) : type === 'boolean' ? (
            <span className="text-amber-400">{String(value)}</span>
          ) : type === 'null' ? (
            <span className="text-zinc-500">null</span>
          ) : type === 'array' ? (
            <span className="text-(--vestara-text-muted)">[]</span>
          ) : (
            <span className="text-(--vestara-text-muted)">{'{}'}</span>
          )}
        </span>
        <span className={`ml-1 px-1 rounded text-[10px] font-mono ${typeStyles[type] || ''}`}>{type}</span>
        {!isLast && <span className="text-(--vestara-text-muted) ml-1">,</span>}
      </div>
    );
  }

  // Collapsible nodes
  const entries: [string, any][] = type === 'array'
    ? (value as any[]).map((v: any, i: number): [string, any] => [String(i), v])
    : Object.entries(value);

  const bracket = type === 'array' ? ['[', ']'] : ['{', '}'];

  return (
    <div className="leading-tight">
      {/* Toggle line */}
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: indent }}>
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="w-3 h-4 flex items-center justify-center text-(--vestara-text-muted) hover:text-(--vestara-text) cursor-pointer shrink-0 text-xs"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="text-(--vestara-text-muted) font-mono text-xs">{formatKey(label)}</span>
        <span className="text-(--vestara-text-muted)">:</span>
        {collapsed ? (
          <>
            <span className="text-(--vestara-text) font-mono text-xs">
              {bracket[0]}
              {formatPreview(value)}
              {bracket[1]}
            </span>
            <span className={`ml-1 px-1 rounded text-[10px] font-mono ${typeStyles[type]}`}>{type}</span>
          </>
        ) : (
          <>
            <span className="text-(--vestara-text-muted)">{bracket[0]}</span>
            <span className={`ml-1 px-1 rounded text-[10px] font-mono ${typeStyles[type]}`}>{type}</span>
          </>
        )}
        {collapsed && !isLast && <span className="text-(--vestara-text-muted) ml-1">,</span>}
      </div>

      {/* Children */}
      {!collapsed && (
        <div className="border-l border-(--vestara-accent-border) ml-[7px]">
          {entries.map(([key, val]: [string, any], i: number) => (
            <TreeNode
              key={key}
              value={val}
              label={key}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
              isLast={i === entries.length - 1}
            />
          ))}
          <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: (depth + 1) * 16 }}>
            <span className="text-(--vestara-text-muted) text-xs">{bracket[1]}</span>
            {!isLast && <span className="text-(--vestara-text-muted) ml-1">,</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * JsonTreeView — renders any JSON value as a collapsible, typed tree.
 *
 * Features:
 * - Type annotations with colored badges (string, number, boolean, null, array, object)
 * - Expandable/collapsible object and array nodes
 * - Preview text on collapsed nodes
 * - Configurable auto-expand depth
 * - Dark theme (uses --vestara-* CSS variables)
 */
export default function JsonTreeView({ data, defaultExpandDepth = 2, label = 'root' }: JsonTreeViewProps) {
  // Edge case: non-object/array root
  const type = getType(data);
  if (type !== 'object' && type !== 'array') {
    return (
      <div className="bg-(--color-zinc-950) border border-(--vestara-accent-border) rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-xs">
        <TreeNode
          value={data}
          label={label}
          depth={0}
          defaultExpandDepth={defaultExpandDepth}
          isLast={true}
        />
      </div>
    );
  }

  return (
    <div className="bg-(--color-zinc-950) border border-(--vestara-accent-border) rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-xs">
      <TreeNode
        value={data}
        label={label}
        depth={0}
        defaultExpandDepth={defaultExpandDepth}
        isLast={true}
      />
    </div>
  );
}
