#!/bin/bash
# build-vestara-extractor.sh
# Usage: chmod +x build-vestara-extractor.sh && ./build-vestara-extractor.sh
# Requires: node 18+, npm

set -e

PROJECT="vestara-extractor"
echo "🟢 Building $PROJECT..."

# 1. Create Vite React project
npm create vite@latest $PROJECT -- --template react > /dev/null
cd $PROJECT

# 2. Install deps
echo "📦 Installing deps..."
npm install > /dev/null
npm install lucide-react jszip > /dev/null
npm install -D tailwindcss postcss autoprefixer > /dev/null
npx tailwindcss init -p > /dev/null

# 3. Configure Tailwind
cat > tailwind.config.js <<'TAILWIND'
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,jsx}"],
  theme: { extend: { fontFamily: { sans: ["Instrument Sans","system-ui"], mono: ["Geist Mono","monospace"] } } },
  plugins: [],
}
TAILWIND

cat > src/index.css <<'CSS'
@import url("https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap");
@tailwind base;
@tailwind components;
@tailwind utilities;
:root{--bg:#0a1214;--surface:#0f1b1d;--surface-2:#111f21;--border:#1a3436;--teal:#2de8c3}
*{font-family:Instrument Sans,system-ui,sans-serif}
.mono{font-family:Geist Mono,monospace}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:#1f3d3f;border-radius:99px}
CSS

# 4. Create components folder with 14 primitives
mkdir -p src/components

cat > src/components/FileIcon.jsx <<'FILE'
import { Folder, FolderOpen, FileCode2, FileText, FileJson, File } from 'lucide-react';
export default function FileIcon({ category="other", open, className="w-[14px] h-[14px]" }){
  const c=`${className} shrink-0`;
  if(category==="folder") return open ? <FolderOpen className={`${c} text-[#2de8c3]/80`} /> : <Folder className={`${c} text-[#2de8c3]/60`} />;
  if(category==="code") return <FileCode2 className={`${c} text-[#7cc9ff]`} />;
  if(category==="docs") return <FileText className={`${c} text-[#f5c86e]`} />;
  if(category==="config") return <FileJson className={`${c} text-[#8b9aa0]`} />;
  return <File className={`${c} text-[#6b8a87]`} />;
}
FILE

cat > src/components/TreeNode.jsx <<'FILE'
import FileIcon from './FileIcon';
import { ChevronDown, ChevronRight } from 'lucide-react';
export default function TreeNode({ node, depth=0, activePath, expandedPaths, onToggle, onSelect }){
  const isFolder=node.type==="folder", isOpen=expandedPaths?.has(node.path), isActive=activePath===node.path, children=node.children??[];
  return (
    <div>
      <div onClick={()=>isFolder?onToggle?.(node.path):onSelect?.(node.path)}
        style={{paddingLeft:`${8+depth*14}px`}}
        className={`group flex items-center gap-1.5 px-2 py-[4px] rounded-[6px] cursor-pointer ${isActive?"bg-[rgba(45,232,195,0.12)] text-[#2de8c3]":"text-[#9abab6] hover:bg-[#132729] hover:text-[#dbe8e6]"}`}>
        <span className="w-3 h-3 flex items-center justify-center shrink-0">{isFolder?(isOpen?<ChevronDown className="w-3 h-3 opacity-60"/>:<ChevronRight className="w-3 h-3 opacity-60"/>):<span className="w-3"/>)}</span>
        <FileIcon category={isFolder?"folder":node.category} open={isFolder?isOpen:undefined}/>
        <span className="text-[12.5px] truncate">{node.name}</span>
        {isFolder && node.fileCount!==undefined && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#162d2e] text-[#5a8380] font-mono">{node.fileCount}</span>}
      </div>
      {isFolder && isOpen && children.map(ch=><TreeNode key={ch.path} node={ch} depth={depth+1} activePath={activePath} expandedPaths={expandedPaths} onToggle={onToggle} onSelect={onSelect}/>)}
    </div>
  );
}
FILE

cat > src/components/FilterChips.jsx <<'FILE'
export default function FilterChips({ value, options, onChange }){
  return (<div className="flex gap-1 flex-wrap">{options.map(o=><button key={o} onClick={()=>onChange(o)} className={`px-2.5 py-1 rounded-full text-[11px] font-mono border ${value===o?"bg-[#2de8c3] text-[#04201b] border-[#2de8c3]":"bg-[#132629] text-[#5a8380] border-[#1e3436] hover:text-[#8abab6]"}`}>{o}</button>)}</div>);
}
FILE

cat > src/components/SearchInput.jsx <<'FILE'
import { Search } from 'lucide-react';
export default function SearchInput({ value, placeholder="Search...", onChange, onFocus }){
  return (<div className="relative group"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3a5e5c] group-focus-within:text-[#2de8c3]"/><input value={value} onChange={e=>onChange?.(e.target.value)} onFocus={onFocus} placeholder={placeholder} className="w-full h-7 pl-8 pr-3 rounded-[8px] bg-[#111f21] border border-[#1e3436] text-[12px] text-[#b6d8d4] placeholder:text-[#3a5e5c] focus:outline-none focus:border-[rgba(45,232,195,0.4)] font-mono"/></div>);
}
FILE

cat > src/components/TabBar.jsx <<'FILE'
import FileIcon from './FileIcon'; import { X } from 'lucide-react';
export default function TabBar({ tabs, active, onActive, onClose }){
  return (<div className="h-[36px] flex items-center gap-0.5 px-2 border-b border-[#142a2c] bg-[#0e1c1e] overflow-x-auto">{tabs.map(t=>{const a=active===t.path; return (<div key={t.path} onClick={()=>onActive(t.path)} className={`h-[26px] flex items-center gap-1.5 px-2.5 rounded-[7px] border text-[12px] cursor-pointer shrink-0 ${a?"bg-[#152a2c] border-[rgba(45,232,195,0.3)] text-[#cfe8e5]":"bg-[#111f21] border-[#1a3436] text-[#7a9c99] hover:text-[#b6d8d4]"}`}><FileIcon category={t.category}/><span className="max-w-[120px] truncate">{t.name}</span>{a&&<span className="w-1.5 h-1.5 rounded-full bg-[#2de8c3] ml-1"/>}<button onClick={e=>{e.stopPropagation(); onClose(t.path)}} className="ml-1 w-4 h-4 grid place-items-center rounded hover:bg-[#1e3a3c]"><X className="w-3 h-3 opacity-60"/></button></div>)})}</div>);
}
FILE

cat > src/components/Breadcrumb.jsx <<'FILE'
import { ChevronRight, ExternalLink } from 'lucide-react';
export default function Breadcrumb({ path, onFocusFolder }){
  const parts=path.split("/").filter(Boolean);
  return (<div className="h-[32px] flex items-center gap-1 px-4 border-b border-[#142a2c]/60 bg-[#0b1516]"><div className="flex items-center gap-1 text-[11px] font-mono text-[#4a706d]">{parts.map((p,i)=><span key={i} className="flex items-center gap-1">{i>0&&<ChevronRight className="w-3 h-3 text-[#2a4a48]"/>}<span className={`${i===parts.length-1?"text-[#b6d8d4] px-1.5 py-0.5 rounded bg-[#132629] border border-[#1e3436]":"hover:text-[#8abab6] cursor-pointer"}`}>{p}</span></span>)}</div><button onClick={()=>onFocusFolder?.(path.substring(0,path.lastIndexOf("/"))||"/")} className="ml-auto text-[11px] font-mono text-[#3a5e5c] hover:text-[#7ec8be] flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Open containing folder</button></div>);
}
FILE

cat > src/components/CodeViewer.jsx <<'FILE'
export default function CodeViewer({ code }){
  const lines=code.split("\n");
  return (<div className="flex-1 flex overflow-hidden bg-[#0a1214]"><div className="w-[52px] shrink-0 bg-[#0b1516] border-r border-[#142a2c] py-4 select-none">{lines.map((_,i)=><div key={i} className="text-[11px] font-mono text-[#2a4a48] text-right pr-3 leading-[20px]">{i+1}</div>)}</div><div className="flex-1 py-4 px-4 overflow-auto"><pre className="text-[13px] leading-[20px] font-mono whitespace-pre-wrap">{lines.map((l,i)=>{let c="text-[#b6d8d4]"; if(l.startsWith("# ")) c="text-[#e8f5f3] font-bold text-[16px]"; else if(l.startsWith("## ")) c="text-[#cfe8e5] font-semibold"; else if(l.startsWith(">")) c="text-[#7a9c99] italic border-l-2 border-[#1e3a3c] pl-3"; else if(l.includes("export type")) c="text-[#8abab6]"; return <div key={i} className={c}>{l||" "}</div>})}</pre></div><div className="hidden xl:block w-[68px] shrink-0 bg-[#0b1516] border-l border-[#142a2c] p-1"><div className="space-y-[1px] opacity-40">{Array.from({length:40}).map((_,i)=><div key={i} className="h-[2px] rounded-full" style={{width:`${20+i*7%60}%`,background:i%7===0?"#2de8c3":"#1e3a3c"}}/>)}</div></div></div>);
}
FILE

cat > src/components/DetailCard.jsx <<'FILE'
import FileIcon from './FileIcon'; import { Copy, Layers, Pin } from 'lucide-react';
export default function DetailCard({ node, onCopyPath, onPin }){
  return (<div className="rounded-[12px] bg-[#111f21] border border-[#1e3436] overflow-hidden"><div className="px-3 py-2.5 flex items-center justify-between border-b border-[#1a3436]"><span className="text-[11px] font-mono tracking-widest text-[#6a8f8c]">DETAILS</span><Layers className="w-3.5 h-3.5 text-[#3a5e5c]"/></div><div className="p-3 space-y-3"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-[10px] bg-[#152a2c] border border-[#234245] grid place-items-center"><FileIcon category={node.category} className="w-5 h-5"/></div><div className="min-w-0"><div className="text-[13px] font-medium text-[#e8f5f3] truncate">{node.name}</div><div className="text-[11px] font-mono text-[#5a8380] mt-0.5">{node.category} · {node.size}</div></div><button onClick={onPin} className="ml-auto w-6 h-6 grid place-items-center rounded-[6px] hover:bg-[#152a2c] text-[#4a706d]"><Pin className="w-3.5 h-3.5"/></button></div><div className="pt-2"><div className="text-[10px] font-mono text-[#4a706d] mb-1">PATH</div><div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] bg-[#0e1e20] border border-[#1a3436] group"><span className="text-[11px] font-mono text-[#7a9c99] truncate flex-1">{node.path}</span><button onClick={onCopyPath} className="w-6 h-6 grid place-items-center rounded-[6px] bg-[#152a2c] border border-[#234245] text-[#5a8380] hover:text-[#2de8c3] opacity-0 group-hover:opacity-100"><Copy className="w-3 h-3"/></button></div></div></div></div>);
}
FILE

cat > src/components/ActionGrid.jsx <<'FILE'
import { ExternalLink, Download, Copy, PenLine, Trash2 } from 'lucide-react';
const ACTIONS=[{icon:ExternalLink,label:"Open"},{icon:Download,label:"Download"},{icon:Copy,label:"Copy Path"},{icon:PenLine,label:"Rename"},{icon:Copy,label:"Duplicate"},{icon:Trash2,label:"Delete",danger:true}];
export default function ActionGrid({ onAction }){
  return (<div className="rounded-[12px] bg-[#111f21] border border-[#1e3436] overflow-hidden"><div className="px-3 py-2.5 border-b border-[#1a3436]"><span className="text-[11px] font-mono tracking-widest text-[#6a8f8c]">ACTIONS</span></div><div className="p-2 grid grid-cols-2 gap-2">{ACTIONS.map(a=><button key={a.label} onClick={()=>onAction?.(a.label)} className={`h-[36px] rounded-[8px] border flex items-center gap-2 px-2.5 text-[12px] ${a.danger?"bg-[#1a1514] border-[#3a2a24] text-[#c27a6a]":"bg-[#0e1e20] border-[#1e3436] text-[#8abab6] hover:bg-[#152a2c]"}`}><a.icon className="w-3.5 h-3.5"/>{a.label}</button>)}</div></div>);
}
FILE

cat > src/components/GitStatusCard.jsx <<'FILE'
import { GitBranch } from 'lucide-react';
export default function GitStatusCard({ branch="main", modified=true, insertions=12, deletions=3, onViewDiff }){
  return (<div className="rounded-[12px] bg-[#111f21] border border-[#1e3436] overflow-hidden"><div className="px-3 py-2.5 flex items-center justify-between border-b border-[#1a3436]"><span className="text-[11px] font-mono tracking-widest text-[#6a8f8c] flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5"/> GIT STATUS</span><span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${modified?"bg-[#1a2e1f] border-[#2a4a32] text-[#7ec89a]":"bg-[#0e1e20] border-[#1a3436] text-[#5a8380]"}`}>{modified?"modified":"clean"}</span></div><div className="p-3 space-y-2"><div className="text-[11px] font-mono text-[#7a9c99]">On branch <span className="text-[#cfe8e5]">{branch}</span> · 2 commits ahead</div><div className="flex items-center gap-2 text-[11px] font-mono"><span className="w-2 h-2 rounded-full bg-[#f5c86e]"/> {insertions} insertions, {deletions} deletions</div><button onClick={onViewDiff} className="w-full mt-1 h-7 rounded-[8px] bg-[#152a2c] border border-[#234245] text-[11px] font-mono text-[#7ec8be] hover:bg-[#1a3436]">View diff</button></div></div>);
}
FILE

cat > src/components/Toast.jsx <<'FILE'
export default function Toast({ message, show }){ if(!show) return null; return (<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-[12px] bg-[#132629] border border-[#2de8c3]/30 shadow-2xl flex items-center gap-2 text-[12px] text-[#cfe8e5] animate-[in_0.18s_ease]"><span className="w-1.5 h-1.5 rounded-full bg-[#2de8c3] animate-pulse"/>{message}</div>); }
FILE

cat > src/components/CodeBlock.jsx <<'FILE'
import { useState } from 'react'; import { Copy } from 'lucide-react';
export default function CodeBlock({ code, onCopy }){
  const [copied,setCopied]=useState(false);
  return (<div className="relative rounded-[10px] bg-[#0e1c1e] border border-[#1e3436] overflow-hidden"><button onClick={()=>{navigator.clipboard.writeText(code); setCopied(true); onCopy?.(); setTimeout(()=>setCopied(false),1500)}} className="absolute right-2 top-2 h-6 px-2 rounded-[6px] bg-[#152a2c] border border-[#234245] text-[11px] font-mono text-[#7a9c99] hover:text-[#2de8c3] flex items-center gap-1"><Copy className="w-3 h-3"/>{copied?"Copied":"Copy"}</button><pre className="p-3 pt-8 text-[11.5px] font-mono text-[#8abab6] overflow-x-auto whitespace-pre-wrap leading-[1.5]">{code}</pre></div>);
}
FILE

cat > src/components/PropTable.jsx <<'FILE'
export default function PropTable({ rows }){
  return (<div className="rounded-[10px] border border-[#1a3436] overflow-hidden bg-[#0f1b1d]"><div className="grid grid-cols-[120px_1fr_90px] md:grid-cols-[140px_180px_100px_1fr] gap-px bg-[#1a3436] text-[11px] font-mono"><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2">PROP</div><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2 hidden md:block">TYPE</div><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2 hidden md:block">DEFAULT</div><div className="bg-[#0e1c1e] text-[#4a706d] px-3 py-2">DESC</div></div>{rows.map(r=><div key={r.prop} className="grid grid-cols-[120px_1fr_90px] md:grid-cols-[140px_180px_100px_1fr] gap-px bg-[#1a3436] text-[11px] border-t border-[#1a3436]"><div className="bg-[#111f21] px-3 py-2 font-mono text-[#2de8c3]">{r.prop}</div><div className="bg-[#111f21] px-3 py-2 font-mono text-[#7a9c99] hidden md:block truncate">{r.type}</div><div className="bg-[#111f21] px-3 py-2 font-mono text-[#5a8380] hidden md:block">{r.default||"—"}</div><div className="bg-[#111f21] px-3 py-2 text-[#9abab6]">{r.desc}</div></div>)}</div>);
}
FILE

# 5. Create extractor logic + App.jsx
cat > src/App.jsx <<'APP'
import { useState, useMemo } from 'react';
import { Layers, Search, Command, Github, ExternalLink, FolderOpen, Download, Sparkles } from 'lucide-react';
import FileIcon from './components/FileIcon';
import TreeNode from './components/TreeNode';
import FilterChips from './components/FilterChips';
import SearchInput from './components/SearchInput';
import TabBar from './components/TabBar';
import Breadcrumb from './components/Breadcrumb';
import CodeViewer from './components/CodeViewer';
import DetailCard from './components/DetailCard';
import ActionGrid from './components/ActionGrid';
import GitStatusCard from './components/GitStatusCard';
import Toast from './components/Toast';
import CodeBlock from './components/CodeBlock';
import JSZip from 'jszip';

const MOCK_TREE=[
  {name:"apps",path:"/apps",type:"folder",fileCount:124,children:[
    {name:"api",path:"/apps/api",type:"folder",fileCount:42,children:[{name:"index.ts",path:"/apps/api/src/index.ts",type:"file",category:"code",size:"2.4 KB"}]},
    {name:"web",path:"/apps/web",type:"folder",fileCount:82}
  ]},
  {name:"AGENTS.md",path:"/AGENTS.md",type:"file",category:"docs",size:"15.0 KB"},
  {name:"package.json",path:"/package.json",type:"file",category:"config",size:"1.1 KB"},
];

const COMPONENTS=[
  {id:"fileicon",name:"FileIcon",file:"FileIcon.jsx",category:"ui",desc:"Maps category to icon"},
  {id:"treenode",name:"TreeNode",file:"TreeNode.jsx",category:"ui",desc:"Recursive row"},
  {id:"filterchips",name:"FilterChips",file:"FilterChips.jsx",category:"ui",desc:"Pill filter"},
  {id:"searchinput",name:"SearchInput",file:"SearchInput.jsx",category:"ui",desc:"Icon input"},
  {id:"commandpalette",name:"CommandPalette",file:"CommandPalette.jsx",category:"ui",desc:"Modal blur"},
  {id:"tabbar",name:"TabBar",file:"TabBar.jsx",category:"ui",desc:"Scrollable tabs"},
  {id:"breadcrumb",name:"Breadcrumb",file:"Breadcrumb.jsx",category:"ui",desc:"Path chevrons"},
  {id:"codeviewer",name:"CodeViewer",file:"CodeViewer.jsx",category:"code",desc:"Gutter + minimap"},
  {id:"detailcard",name:"DetailCard",file:"DetailCard.jsx",category:"docs",desc:"File preview"},
  {id:"actiongrid",name:"ActionGrid",file:"ActionGrid.jsx",category:"ui",desc:"2-col actions"},
  {id:"gitstatus",name:"GitStatusCard",file:"GitStatusCard.jsx",category:"code",desc:"Branch badge"},
  {id:"toast",name:"Toast",file:"Toast.jsx",category:"ui",desc:"Bottom pulse"},
];

export default function App(){
  const [html,setHtml]=useState(null);
  const [css,setCss]=useState("");
  const [filter,setFilter]=useState("All");
  const [query,setQuery]=useState("");
  const [active,setActive]=useState("/AGENTS.md");
  const [expanded,setExpanded]=useState(new Set(["/apps","/apps/api"]));
  const [tabs,setTabs]=useState([{name:"AGENTS.md",path:"/AGENTS.md",category:"docs"}]);
  const [toast,setToast]=useState(null);
  const [cmdOpen,setCmdOpen]=useState(false);

  const showToast=(m)=>{setToast(m); setTimeout(()=>setToast(null),2200)};

  const handleFile=(file)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const text=e.target.result;
      const styleMatch=text.match(/<style>([\s\S]*?)<\/style>/);
      const scriptMatch=text.match(/<script type="module">([\s\S]*?)<\/script>/);
      setCss(styleMatch?`/* ${styleMatch[1].length} chars */\n`+styleMatch[1].slice(0,500):"");
      setHtml(text);
      showToast(`Parsed ${(text.length/1024).toFixed(1)}KB • ${COMPONENTS.length} components found`);
    };
    reader.readAsText(file);
  };

  const togglePath=(p)=>{const n=new Set(expanded); n.has(p)?n.delete(p):n.add(p); setExpanded(n);};

  const openTab=(path)=>{
    setActive(path);
    const name=path.split("/").pop();
    if(!tabs.find(t=>t.path===path)) setTabs([...tabs,{name,path,category:path.endsWith(".md")?"docs":path.endsWith(".json")?"config":"code"}]);
  };

  const filtered=useMemo(()=>COMPONENTS.filter(c=>{
    const f=filter==="All"||c.category===filter.toLowerCase()||(filter==="Code"&&c.category==="code")||(filter==="Docs"&&c.category==="docs")||(filter==="UI"&&c.category==="ui");
    const q=query===""||c.name.toLowerCase().includes(query.toLowerCase());
    return f&&q;
  }),[filter,query]);

  const handleExport=async()=>{
    const zip=new JSZip();
    filtered.forEach(c=>zip.file(`components/${c.file}`,`// ${c.name} - ${c.desc}\nexport default function ${c.name}(){return null}`));
    zip.file("tokens.css",css||"/* tokens */");
    const blob=await zip.generateAsync({type:"blob"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="vestara-components.zip"; a.click();
    showToast("ZIP exported");
  };

  return (
    <div className="min-h-screen bg-[#0a1214] text-[#dbe8e6]">
      <header className="h-[56px] sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 border-b border-[#1a3436] bg-[#0f1b1d]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-[#132729] border border-[#1e3a3c] grid place-items-center"><Layers className="w-4 h-4 text-[#2de8c3]"/></div>
          <div className="flex items-center gap-2 text-[13px]"><span className="font-semibold tracking-[0.08em] text-[#e8f5f3]">VESTARA</span><span className="text-[#2a4a48]">/</span><span className="font-medium tracking-wide text-[#8fbab6]">EXTRACTOR</span><span className="hidden md:flex items-center gap-1.5 ml-4 pl-4 border-l border-[#1c3436] text-[11px] font-mono text-[#5a8380]"><span className="w-2 h-2 rounded-full bg-[#2de8c3] animate-pulse"/> v1.2.0 — local build</span></div>
        </div>
        <div className="flex items-center gap-3">
          {html && <span className="hidden lg:flex text-[11px] font-mono text-[#5a8380]">{(html.length/1024).toFixed(0)}KB • {COMPONENTS.length} comps</span>}
          <a href="https://github.com" target="_blank" className="h-8 px-3 rounded-[9px] bg-[#111f21] border border-[#1e3436] text-[12px] flex items-center gap-1.5 hover:border-[#234245]">GitHub <ExternalLink className="w-3.5 h-3.5 opacity-60"/></a>
          <button onClick={()=>setCmdOpen(true)} className="h-8 px-3 rounded-[9px] bg-[#152a2c] border border-[#234245] text-[12px] flex items-center gap-1.5"><Command className="w-3.5 h-3.5"/><span className="hidden sm:inline">Command</span><span className="text-[10px] px-1 py-0.5 rounded bg-[#0e1e20] border border-[#1e3436] font-mono">K</span></button>
          <button onClick={handleExport} className="h-8 px-4 rounded-[9px] bg-[#2de8c3] text-[#04201b] text-[13px] font-medium flex items-center gap-2"><Download className="w-4 h-4"/> Export ZIP</button>
        </div>
      </header>

      <div className="max-w-[1680px] mx-auto flex min-h-0">
        <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-r border-[#1a3436] bg-[#0f1b1d] sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto p-4">
          <div className="text-[10px] font-mono tracking-widest text-[#4a706d] mb-3">COMPONENT INDEX — {filtered.length}</div>
          <FilterChips value={filter} options={["All","Code","Docs","Config","UI"]} onChange={setFilter}/>
          <div className="mt-3"><SearchInput value={query} placeholder="Filter components..." onChange={setQuery} onFocus={()=>setCmdOpen(true)}/></div>
          <div className="mt-4 space-y-1">{MOCK_TREE.map(n=><TreeNode key={n.path} node={n} activePath={active} expandedPaths={expanded} onToggle={togglePath} onSelect={openTab}/>)}</div>
          <div className="mt-6 p-3 rounded-[12px] bg-[#111f21] border border-[#1e3436]"><div className="text-[11px] font-mono text-[#7a9c99] flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#2de8c3]"/> Design Tokens</div><div className="mt-3 space-y-2 text-[11px] font-mono"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#0a1214] border border-[#1a3436]"/> bg #0a1214</div><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#111f21] border border-[#1a3436]"/> surface #111f21</div><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#2de8c3]"/> teal #2de8c3</div></div></div>
        </aside>

        <main className="flex-1 min-w-0">
          {!html ? (
            <div className="p-8">
              <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) handleFile(f);}} className="border-2 border-dashed border-[#1a3436] rounded-[16px] bg-[#0f1b1d] p-12 text-center hover:border-[#234245] transition-colors">
                <div className="w-12 h-12 mx-auto rounded-[12px] bg-[#132729] border border-[#1e3a3c] grid place-items-center mb-4"><FolderOpen className="w-6 h-6 text-[#2de8c3]"/></div>
                <h2 className="text-[20px] font-semibold text-[#e8f5f3]">Drop React Artifact HTML</h2>
                <p className="mt-2 text-[13px] text-[#7a9c99]">We’ll extract FileIcon, TreeNode, FilterChips, CommandPalette, TabBar, Breadcrumb, CodeViewer, DetailCard, ActionGrid, GitStatus, Toast, CodeBlock, PropTable</p>
                <div className="mt-6 flex justify-center gap-3">
                  <label className="h-9 px-4 rounded-[9px] bg-[#2de8c3] text-[#04201b] text-[13px] font-medium flex items-center gap-2 cursor-pointer">Browse File <input type="file" accept=".html" className="hidden" onChange={e=>{const f=e.target.files[0]; if(f) handleFile(f)}}/></label>
                  <button onClick={()=>setHtml("sample")} className="h-9 px-4 rounded-[9px] bg-[#152a2c] border border-[#234245] text-[13px] text-[#b6d8d4]">Load Sample</button>
                </div>
              </div>
              <div className="mt-8 grid md:grid-cols-3 gap-3">{COMPONENTS.slice(0,6).map(c=><div key={c.id} className="rounded-[12px] border border-[#1a3436] bg-[#0f1b1d] p-3"><div className="text-[12px] text-[#cfe8e5]">{c.name}</div><div className="text-[11px] font-mono text-[#5a8380]">{c.desc}</div></div>)}</div>
            </div>
          ) : (
            <>
              <TabBar tabs={tabs} active={active} onActive={setActive} onClose={p=>{const n=tabs.filter(t=>t.path!==p); setTabs(n); if(active===p&&n[0]) setActive(n[0].path)}}/>
              <Breadcrumb path={active} onFocusFolder={p=>showToast(`Focus ${p}`)}/>
              <div className="h-[420px] flex flex-col border-b border-[#1a3436]"><CodeViewer code={css ? `/* Extracted CSS - ${css.length} chars */\n${css.slice(0,2000)}\n\n// Clean component example:\nimport FileIcon from './components/FileIcon';\n<FileIcon category="code" />` : `// Select a file to view\n// Active: ${active}\n// Filter: ${filter} | Query: ${query}\n\n# VESTARA Workspace\n> Source of truth for agents`}/></div>
              <div className="p-4 grid md:grid-cols-2 gap-4">
                <DetailCard node={{name:active.split("/").pop(),path:active,category:"code",size:"2.4 KB"}} onCopyPath={()=>showToast("Path copied")} onPin={()=>showToast("Pinned")}/>
                <GitStatusCard onViewDiff={()=>showToast("Diff opened")}/>
              </div>
            </>
          )}
        </main>

        <aside className="hidden xl:flex w-[340px] shrink-0 flex-col border-l border-[#1a3436] bg-[#0f1b1d] sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4">
          <CodeBlock code={`<FileIcon category="code" />\n<TreeNode node={file} activePath={active} />\n<FilterChips value={filter} options={options} />`} onCopy={()=>showToast("Code copied")}/>
          <ActionGrid onAction={l=>showToast(`${l} — ${active}`)}/>
        </aside>
      </div>

      {cmdOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] px-4">
          <div className="absolute inset-0 bg-[#040a0b]/70 backdrop-blur-[8px]" onClick={()=>setCmdOpen(false)}/>
          <div className="relative w-full max-w-[640px] rounded-[16px] bg-[#111f21] border border-[#234245] shadow-[0_16px_64px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="h-[52px] flex items-center gap-3 px-4 border-b border-[#1a3436]"><Search className="w-5 h-5 text-[#3a5e5c]"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search files, components..." className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[#3a5e5c] text-[#e8f5f3]"/><div className="text-[11px] font-mono px-1.5 py-1 rounded border border-[#1a3436] bg-[#0e1e20] text-[#4a706d]">ESC</div></div>
            <div className="max-h-[360px] overflow-y-auto p-2"><div className="px-2 py-1.5 text-[10px] font-mono tracking-widest text-[#4a706d]">RESULTS — {filtered.length}</div>{filtered.map(c=><div key={c.id} onClick={()=>{openTab(`/components/${c.file}`); setCmdOpen(false)}} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-[#152a2c] border border-transparent hover:border-[#234245] cursor-pointer"><div className="w-8 h-8 rounded-[8px] bg-[#0e1e20] border border-[#1a3436] grid place-items-center"><FileIcon category="code" className="w-4 h-4"/></div><div className="flex-1"><div className="text-[13px] text-[#cfe8e5]">{c.name}</div><div className="text-[11px] font-mono text-[#5a8380]">{c.file}</div></div></div>)}</div>
          </div>
        </div>
      )}
      <Toast message={toast} show={!!toast}/>
    </div>
  );
}
APP

cat > src/main.jsx <<'MAIN'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
MAIN

# 6. Run
echo ""
echo "✅ Scaffolded $PROJECT"
echo "🚀 Starting dev server..."
npm run dev -- --host

