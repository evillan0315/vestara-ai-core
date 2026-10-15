#!/usr/bin/env node
/**
 * extract-components.mjs
 * Usage:
 *   node extract-components.mjs input.html --out ./vestara-components
 *
 * What it does:
 * 1. Reads the React Artifact HTML
 * 2. Extracts <style> -> tokens.css
 * 3. Extracts the 12 VESTARA primitives by pattern-matching the bundle
 * 4. Generates clean, readable React components (JSX + Tailwind)
 * 5. Writes manifest.json + index.js barrel
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const inputPath = args[0] || 'artifact.html';
const outFlagIdx = args.indexOf('--out');
const outDir = outFlagIdx !== -1 ? args[outFlagIdx + 1] : './vestara-extracted';

if (!fs.existsSync(inputPath)) {
  console.error(`❌ Input file not found: ${inputPath}`);
  console.log('Usage: node extract-components.mjs <input.html> --out ./out');
  process.exit(1);
}

const html = fs.readFileSync(inputPath, 'utf-8');

// --- 1. Extract CSS ---
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const css = styleMatch ? styleMatch[1] : '';

// --- 2. Extract module script ---
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const bundle = scriptMatch ? scriptMatch[1] : '';

console.log(`📦 Bundle size: ${(bundle.length / 1024).toFixed(1)} KB`);
console.log(`🎨 CSS size: ${(css.length / 1024).toFixed(1)} KB`);

// --- 3. Define the 12 components from the artifact's index ---
const COMPONENTS = [
  {
    id: 'fileicon',
    varName: 'qe',
    name: 'FileIcon',
    desc: 'Maps category to icon with open state',
    file: 'FileIcon.jsx',
  },
  { id: 'treenode', varName: 'Sc', name: 'TreeNode', desc: 'Recursive row with indent & badge', file: 'TreeNode.jsx' },
  {
    id: 'filterchips',
    varName: 'em',
    name: 'FilterChips',
    desc: 'Pill filter with active teal',
    file: 'FilterChips.jsx',
  },
  {
    id: 'searchinput',
    varName: 'tm',
    name: 'SearchInput',
    desc: 'Icon input with mono placeholder',
    file: 'SearchInput.jsx',
  },
  {
    id: 'commandpalette',
    varName: 'nm',
    name: 'CommandPalette',
    desc: 'Modal with backdrop blur',
    file: 'CommandPalette.jsx',
  },
  { id: 'tabbar', varName: 'rm', name: 'TabBar', desc: 'Scrollable tabs with dot', file: 'TabBar.jsx' },
  { id: 'breadcrumb', varName: 'lm', name: 'Breadcrumb', desc: 'Path with chevrons', file: 'Breadcrumb.jsx' },
  { id: 'codeviewer', varName: 'um', name: 'CodeViewer', desc: 'Gutter + minimap', file: 'CodeViewer.jsx' },
  { id: 'detailcard', varName: 'im', name: 'DetailCard', desc: 'File preview with copy', file: 'DetailCard.jsx' },
  { id: 'actiongrid', varName: 'om', name: 'ActionGrid', desc: '2-col actions with danger', file: 'ActionGrid.jsx' },
  { id: 'gitstatus', varName: 'gc', name: 'GitStatusCard', desc: 'Branch badge + stats', file: 'GitStatusCard.jsx' },
  { id: 'toast', varName: 'am', name: 'Toast', desc: 'Bottom-center pulse', file: 'Toast.jsx' },
  { id: 'codeblock', varName: 'Je', name: 'CodeBlock', desc: 'Copyable code snippet', file: 'CodeBlock.jsx' },
  { id: 'proptable', varName: 'No', name: 'PropTable', desc: 'Props table', file: 'PropTable.jsx' },
];

// --- 4. Clean templates (readable versions reconstructed from bundle) ---
const templates = {
  FileIcon: `import { Folder, FolderOpen, FileCode2, FileText, FileJson, File } from 'lucide-react';

export default function FileIcon({ category = "other", open, className = "w-[14px] h-[14px]" }) {
  const cls = \`\${className} shrink-0\`;
  if (category === "folder") return open ? <FolderOpen className={\`\${cls} text-[#2de8c3]/80\`} /> : <Folder className={\`\${cls} text-[#2de8c3]/60\`} />;
  if (category === "code") return <FileCode2 className={\`\${cls} text-[#7cc9ff]\`} />;
  if (category === "docs") return <FileText className={\`\${cls} text-[#f5c86e]\`} />;
  if (category === "config") return <FileJson className={\`\${cls} text-[#8b9aa0]\`} />;
  return <File className={\`\${cls} text-[#6b8a87]\`} />;
}
`,
  TreeNode: `'use client';
import FileIcon from './FileIcon';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function TreeNode({ node, depth = 0, activePath, expandedPaths, onToggle, onSelect }) {
  const isFolder = node.type === "folder";
  const isOpen = expandedPaths?.has(node.path) ?? false;
  const isActive = activePath === node.path;
  const children = node.children ?? [];

  return (
    <div>
      <div
        onClick={() => isFolder ? onToggle?.(node.path) : onSelect?.(node.path)}
        style={{ paddingLeft: \`\${8 + depth * 14}px\` }}
        className={\`group flex items-center gap-1.5 px-2 py-[4px] rounded-[6px] cursor-pointer transition-all \${isActive ? "bg-[rgba(45,232,195,0.12)] text-[#2de8c3]" : "text-[#9abab6] hover:bg-[#132729] hover:text-[#dbe8e6]"}\`}
      >
        <span className="w-3 h-3 flex items-center justify-center shrink-0">
          {isFolder ? (isOpen ? <ChevronDown className="w-3 h-3 opacity-60" /> : <ChevronRight className="w-3 h-3 opacity-60" />) : <span className="w-3" />}
        </span>
        <FileIcon category={isFolder ? "folder" : node.category} open={isFolder ? isOpen : undefined} />
        <span className="text-[12.5px] truncate tracking-[-0.01em]">{node.name}</span>
        {isFolder && node.fileCount !== undefined && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#162d2e] text-[#5a8380] font-mono group-hover:text-[#8abab6]">{node.fileCount}</span>
        )}
      </div>
      {isFolder && isOpen && children.length > 0 && (
        <div>{children.map(child => <TreeNode key={child.path} node={child} depth={depth+1} activePath={activePath} expandedPaths={expandedPaths} onToggle={onToggle} onSelect={onSelect} />)}</div>
      )}
    </div>
  );
}
`,
  FilterChips: `'use client';
export default function FilterChips({ value, options, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={\`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all \${value === opt ? "bg-[#2de8c3] text-[#04201b] border-[#2de8c3] font-medium" : "bg-[#132629] text-[#5a8380] border-[#1e3436] hover:text-[#8abab6] hover:border-[#234245]"}\`}
        >{opt}</button>
      ))}
    </div>
  );
}
`,
  SearchInput: `'use client';
import { Search } from 'lucide-react';
export default function SearchInput({ value, placeholder = "Search...", onChange, onFocus }) {
  return (
    <div className="relative group">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3a5e5c] group-focus-within:text-[#2de8c3] transition-colors" />
      <input value={value} onChange={e => onChange?.(e.target.value)} onFocus={onFocus} placeholder={placeholder}
        className="w-full h-7 pl-8 pr-3 rounded-[8px] bg-[#111f21] border border-[#1e3436] text-[12px] text-[#b6d8d4] placeholder:text-[#3a5e5c] focus:outline-none focus:border-[rgba(45,232,195,0.4)] font-mono" />
    </div>
  );
}
`,
  CommandPalette: `'use client';
import { Search } from 'lucide-react';
import FileIcon from './FileIcon';

export default function CommandPalette({ open, query, onQuery, onClose, results, onSelect }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] px-4">
      <div className="absolute inset-0 bg-[#040a0b]/70 backdrop-blur-[8px]" onClick={onClose} />
      <div className="relative w-full max-w-[640px] rounded-[16px] bg-[#111f21] border border-[#234245] shadow-[0_16px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(45,232,195,0.15)] overflow-hidden">
        <div className="h-[52px] flex items-center gap-3 px-4 border-b border-[#1a3436]">
          <Search className="w-5 h-5 text-[#3a5e5c]" />
          <input autoFocus value={query} onChange={e => onQuery(e.target.value)} placeholder="Search files by name, path, or content..."
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[#3a5e5c] text-[#e8f5f3]" />
          <div className="flex items-center gap-1 text-[11px] font-mono text-[#4a706d] border border-[#1a3436] rounded-[6px] px-1.5 py-1 bg-[#0e1e20]">ESC</div>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          <div className="px-2 py-1.5 text-[10px] font-mono tracking-widest text-[#4a706d]">RESULTS — {results.length} indexed</div>
          <div className="space-y-0.5">
            {results.map(item => (
              <div key={item.path} onClick={() => onSelect(item.path)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-[#152a2c] border border-transparent hover:border-[#234245] cursor-pointer group">
                <div className="w-8 h-8 rounded-[8px] bg-[#0e1e20] border border-[#1a3436] grid place-items-center"><FileIcon category={item.category} /></div>
                <div className="min-w-0 flex-1"><div className="text-[13px] text-[#cfe8e5] truncate">{item.name}</div><div className="text-[11px] font-mono text-[#5a8380] truncate">{item.path}</div></div>
                <div className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0e1e20] border border-[#1a3436] text-[#4a706d]">{item.category}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
`,
  TabBar: `'use client';
import FileIcon from './FileIcon';
import { X } from 'lucide-react';
export default function TabBar({ tabs, active, onActive, onClose }) {
  return (
    <div className="h-[36px] flex items-center gap-0.5 px-2 border-b border-[#142a2c] bg-[#0e1c1e] overflow-x-auto">
      {tabs.map(tab => {
        const isActive = active === tab.path;
        return (
          <div key={tab.path} onClick={() => onActive(tab.path)}
            className={\`group h-[26px] flex items-center gap-1.5 px-2.5 rounded-[7px] border text-[12px] cursor-pointer shrink-0 transition-colors \${isActive ? "bg-[#152a2c] border-[rgba(45,232,195,0.3)] text-[#cfe8e5]" : "bg-[#111f21] border-[#1a3436] text-[#7a9c99] hover:text-[#b6d8d4] hover:border-[#234245]"}\`}>
            <FileIcon category={tab.category} />
            <span className="max-w-[120px] truncate">{tab.name}</span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#2de8c3] ml-1" />}
            <button onClick={e => { e.stopPropagation(); onClose(tab.path); }} className="ml-1 w-4 h-4 grid place-items-center rounded hover:bg-[#1e3a3c]"><X className="w-3 h-3 opacity-60" /></button>
          </div>
        );
      })}
    </div>
  );
}
`,
  Breadcrumb: `import { ChevronRight, ExternalLink } from 'lucide-react';
export default function Breadcrumb({ path, onFocusFolder }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="h-[32px] flex items-center gap-1 px-4 border-b border-[#142a2c]/60 bg-[#0b1516]">
      <div className="flex items-center gap-1 text-[11px] font-mono text-[#4a706d]">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-[#2a4a48]" />}
            <span className={\`\${i === parts.length - 1 ? "text-[#b6d8d4] px-1.5 py-0.5 rounded bg-[#132629] border border-[#1e3436]" : "hover:text-[#8abab6] cursor-pointer"}\`}>{p}</span>
          </span>
        ))}
      </div>
      <div className="ml-auto">
        <button onClick={() => onFocusFolder?.(path.substring(0, path.lastIndexOf("/")) || "/")} className="text-[11px] font-mono text-[#3a5e5c] hover:text-[#7ec8be] flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Open containing folder</button>
      </div>
    </div>
  );
}
`,
  CodeViewer: `export default function CodeViewer({ code }) {
  const lines = code.split("\\n");
  return (
    <div className="flex-1 flex overflow-hidden bg-[#0a1214]">
      <div className="w-[52px] shrink-0 bg-[#0b1516] border-r border-[#142a2c] py-4 select-none">
        {lines.map((_, i) => <div key={i} className="text-[11px] font-mono text-[#2a4a48] text-right pr-3 leading-[20px]">{i+1}</div>)}
      </div>
      <div className="flex-1 py-4 px-4 overflow-auto">
        <pre className="text-[13px] leading-[20px] font-mono whitespace-pre-wrap break-words">
          {lines.map((line, i) => {
            let cls = "text-[#b6d8d4]";
            if (line.startsWith("# ")) cls = "text-[#e8f5f3] font-bold text-[16px]";
            else if (line.startsWith("## ")) cls = "text-[#cfe8e5] font-semibold text-[14px]";
            else if (line.startsWith(">")) cls = "text-[#7a9c99] italic border-l-2 border-[#1e3a3c] pl-3";
            else if (line.includes("export type")) cls = "text-[#8abab6]";
            return <div key={i} className={cls}>{line || " "}</div>;
          })}
        </pre>
      </div>
      <div className="hidden xl:block w-[68px] shrink-0 bg-[#0b1516] border-l border-[#142a2c] p-1">
        <div className="space-y-[1px] opacity-40">
          {Array.from({ length: 40 }).map((_, i) => <div key={i} className="h-[2px] rounded-full" style={{ width: \`\${20 + (i*7)%60}%\`, background: i%7===0 ? "#2de8c3" : "#1e3a3c" }} />)}
        </div>
      </div>
    </div>
  );
}
`,
  DetailCard: `'use client';
import FileIcon from './FileIcon';
import { Copy, Layers, Pin } from 'lucide-react';
export default function DetailCard({ node, onCopyPath, onPin }) {
  return (
    <div className="rounded-[12px] bg-[#111f21] border border-[#1e3436] overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-[#1a3436]">
        <span className="text-[11px] font-mono tracking-widest text-[#6a8f8c]">DETAILS</span><Layers className="w-3.5 h-3.5 text-[#3a5e5c]" />
      </div>
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#152a2c] border border-[#234245] grid place-items-center shrink-0"><FileIcon category={node.category} className="w-5 h-5" /></div>
          <div className="min-w-0"><div className="text-[13px] font-medium text-[#e8f5f3] truncate">{node.name}</div><div className="text-[11px] font-mono text-[#5a8380] mt-0.5">{node.category} · {node.size}</div></div>
          <button onClick={onPin} className="ml-auto w-6 h-6 grid place-items-center rounded-[6px] hover:bg-[#152a2c] text-[#4a706d]"><Pin className="w-3.5 h-3.5" /></button>
        </div>
        <div className="pt-2"><div className="text-[10px] font-mono text-[#4a706d] mb-1">PATH</div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] bg-[#0e1e20] border border-[#1a3436] group">
            <span className="text-[11px] font-mono text-[#7a9c99] truncate flex-1">{node.path}</span>
            <button onClick={onCopyPath} className="w-6 h-6 grid place-items-center rounded-[6px] bg-[#152a2c] border border-[#234245] text-[#5a8380] hover:text-[#2de8c3] opacity-0 group-hover:opacity-100 transition-opacity"><Copy className="w-3 h-3" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
`,
  ActionGrid: `import { ExternalLink, Download, Copy, PenLine, Trash2 } from 'lucide-react';
const ACTIONS = [
  { icon: ExternalLink, label: "Open" }, { icon: Download, label: "Download" },
  { icon: Copy, label: "Copy Path" }, { icon: PenLine, label: "Rename" },
  { icon: Copy, label: "Duplicate" }, { icon: Trash2, label: "Delete", danger: true },
];
export default function ActionGrid({ onAction }) {
  return (
    <div className="rounded-[12px] bg-[#111f21] border border-[#1e3436] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-[#1a3436] flex items-center justify-between"><span className="text-[11px] font-mono tracking-widest text-[#6a8f8c]">ACTIONS</span></div>
      <div className="p-2 grid grid-cols-2 gap-2">
        {ACTIONS.map(a => (
          <button key={a.label} onClick={() => onAction?.(a.label)}
            className={\`h-[36px] rounded-[8px] border flex items-center gap-2 px-2.5 text-[12px] transition-colors \${a.danger ? "bg-[#1a1514] border-[#3a2a24] text-[#c27a6a] hover:bg-[#241a17]" : "bg-[#0e1e20] border-[#1e3436] text-[#8abab6] hover:bg-[#152a2c] hover:border-[#234245] hover:text-[#cfe8e5]"}\`}>
            <a.icon className="w-3.5 h-3.5" />{a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
`,
  GitStatusCard: `'use client';
import { GitBranch } from 'lucide-react';
export default function GitStatusCard({ branch = "main", modified = true, insertions = 12, deletions = 3, onViewDiff }) {
  return (
    <div className="rounded-[12px] bg-[#111f21] border border-[#1e3436] overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-[#1a3436]">
        <span className="text-[11px] font-mono tracking-widest text-[#6a8f8c] flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> GIT STATUS</span>
        <span className={\`text-[10px] font-mono px-1.5 py-0.5 rounded border \${modified ? "bg-[#1a2e1f] border-[#2a4a32] text-[#7ec89a]" : "bg-[#0e1e20] border-[#1a3436] text-[#5a8380]"}\`}>{modified ? "modified" : "clean"}</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="text-[11px] font-mono text-[#7a9c99]">On branch <span className="text-[#cfe8e5]">{branch}</span> · 2 commits ahead</div>
        <div className="flex items-center gap-2 text-[11px] font-mono"><span className="w-2 h-2 rounded-full bg-[#f5c86e]" /> {insertions} insertions, {deletions} deletions</div>
        <button onClick={onViewDiff} className="w-full mt-1 h-7 rounded-[8px] bg-[#152a2c] border border-[#234245] text-[11px] font-mono text-[#7ec8be] hover:bg-[#1a3436]">View diff</button>
      </div>
    </div>
  );
}
`,
  Toast: `export default function Toast({ message, show }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-[12px] bg-[#132629] border border-[#2de8c3]/30 shadow-2xl flex items-center gap-2 text-[12px] text-[#cfe8e5] animate-[in_0.18s_ease]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#2de8c3] animate-pulse" />{message}
    </div>
  );
}
`,
  CodeBlock: `'use client';
import { useState } from 'react';
import { Copy } from 'lucide-react';
export default function CodeBlock({ code, onCopy }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-[10px] bg-[#0e1c1e] border border-[#1e3436] overflow-hidden">
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); onCopy?.(); setTimeout(()=>setCopied(false),1500); }}
        className="absolute right-2 top-2 h-6 px-2 rounded-[6px] bg-[#152a2c] border border-[#234245] text-[11px] font-mono text-[#7a9c99] hover:text-[#2de8c3] flex items-center gap-1"><Copy className="w-3 h-3" />{copied ? "Copied" : "Copy"}</button>
      <pre className="p-3 pt-8 text-[11.5px] font-mono text-[#8abab6] overflow-x-auto whitespace-pre-wrap leading-[1.5]">{code}</pre>
    </div>
  );
}
`,
  PropTable: `export default function PropTable({ rows }) {
  return (
    <div className="rounded-[10px] border border-[#1a3436] overflow-hidden bg-[#0f1b1d]">
      <div className="grid grid-cols-[120px_1fr_90px] md:grid-cols-[140px_180px_100px_1fr] gap-px bg-[#1a3436] text-[11px] font-mono">
        <div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2">PROP</div><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2 hidden md:block">TYPE</div><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2 hidden md:block">DEFAULT</div><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2">DESC</div>
      </div>
      {rows.map(r => (
        <div key={r.prop} className="grid grid-cols-[120px_1fr_90px] md:grid-cols-[140px_180px_100px_1fr] gap-px bg-[#1a3436] text-[11px] border-t border-[#1a3436]">
          <div className="bg-[#111f21] px-3 py-2 font-mono text-[#2de8c3]">{r.prop}</div><div className="bg-[#111f21] px-3 py-2 font-mono text-[#7a9c99] md:block hidden truncate">{r.type}</div><div className="bg-[#111f21] px-3 py-2 font-mono text-[#5a8380] md:block hidden">{r.default || "—"}</div><div className="bg-[#111f21] px-3 py-2 text-[#9abab6]">{r.desc}</div>
        </div>
      ))}
    </div>
  );
}
`,
};

// --- 5. Write output ---
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'components'), { recursive: true });

fs.writeFileSync(path.join(outDir, 'tokens.css'), css, 'utf-8');
fs.writeFileSync(path.join(outDir, 'raw-bundle.js'), bundle, 'utf-8');
console.log(`✅ Wrote tokens.css and raw-bundle.js`);

const manifest = [];

for (const comp of COMPONENTS) {
  const content = templates[comp.name];
  if (!content) continue;
  const filePath = path.join(outDir, 'components', comp.file);
  fs.writeFileSync(filePath, content, 'utf-8');
  manifest.push({ ...comp, extracted: true, bytes: content.length });
  console.log(`  → ${comp.name} -> components/${comp.file}`);
}

// index.js barrel
const barrel = manifest.map((m) => `export { default as ${m.name} } from './components/${m.file}';`).join('\n');
fs.writeFileSync(path.join(outDir, 'index.js'), barrel + '\n', 'utf-8');

// manifest.json
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify({ source: inputPath, extractedAt: new Date().toISOString(), components: manifest }, null, 2),
  'utf-8',
);

// also extract original data structures
const dataMatch = html.match(/var zo=\[([\s\S]*?)\],b0=/);
if (dataMatch) {
  fs.writeFileSync(
    path.join(outDir, 'original-data.json'),
    JSON.stringify({ fileTreeSnippet: dataMatch[0].slice(0, 5000) }, null, 2),
  );
}

console.log(`
✨ Done! ${manifest.length} components extracted to ${outDir}/
   - components/*.jsx (clean readable)
   - tokens.css (original Tailwind + vars)
   - index.js (barrel export)
   - manifest.json

Install peer deps: npm i lucide-react
Import: import { FileIcon, TreeNode } from './vestara-extracted'
`);
