/**
 * Marketplace UI Components — live preview registry.
 *
 * Maps each catalogued @vestara/ui-components id to a small live demo.
 * Sample data lives here (module scope), never inline arrays in JSX
 * (UI-UX governance §6). All demos render the real exported components.
 */

import { useState, type ReactNode } from 'react';
import {
  ABPartitionLayout,
  ActionGrid,
  AppHeader,
  ArchitectureCard,
  AvatarBox,
  Breadcrumb,
  ChatMessage,
  CodeBlock,
  CodeViewer,
  CollapsedBar,
  CommandPalette,
  Composer,
  ConnectionTestButton,
  ConversationGroup,
  ConversationItem,
  DetailCard,
  DisplayNameInput,
  Drawer,
  DrawerMenu,
  ExtensionCard,
  FileIcon,
  FilterChips,
  GapCard,
  GitStatusCard,
  HardwareKeyCard,
  MethodTabs,
  Modal,
  ModelSelector,
  NewChatButton,
  OnboardingShell,
  OperationalPanel,
  OsUnitsCard,
  PartitionCard,
  PassphraseInput,
  ProgressBar,
  PropTable,
  ProviderCard,
  RecoveryGrid,
  RuntimeNotice,
  SearchInput,
  SecureBootToggle,
  SeedGrid,
  Sidebar,
  SplitView,
  StatCard,
  StepProgress,
  StorageOptionCard,
  TabBar,
  TerminalDrawer,
  TerminalPane,
  TerminalSuggest,
  TerminalTabs,
  TestSuiteCard,
  Toast,
  TracerBadge,
  TreeNode,
  TypingIndicator,
  WorkspaceTabs,
  icons,
} from '@vestara/ui-components';
import type {
  ChatMessageData,
  Conversation,
  FileIndexEntry,
  FileNode,
  PropRow,
  TabEntry,
  TerminalSession,
  TestRow,
} from '@vestara/ui-components';

// ─── Sample data (module scope) ────────────────────────────────

const CHIP_OPTIONS = ['All', 'Code', 'Docs', 'Config', 'UI'];
const MODEL_OPTIONS = ['VESTARA-4o · Fast', 'VESTARA-R1 · Reasoning', 'VESTARA-Flash · Lite'];
const SEED_WORDS = ['vestara', 'cipher', 'orbit', 'nexus', 'quanta', 'prism', 'echo', 'lumen', 'drift', 'kernel', 'vector', 'aurora'];

const FILE_TREE: FileNode = {
  name: 'src',
  path: '/src',
  type: 'folder',
  fileCount: 4,
  children: [
    { name: 'components', path: '/src/components', type: 'folder', fileCount: 3, children: [
      { name: 'FileIcon.tsx', path: '/src/components/FileIcon.tsx', type: 'file', category: 'ui', size: '1.2 KB' },
      { name: 'TreeNode.tsx', path: '/src/components/TreeNode.tsx', type: 'file', category: 'ui', size: '2.4 KB' },
    ] },
    { name: 'index.css', path: '/src/index.css', type: 'file', category: 'config', size: '0.6 KB' },
  ],
};

const TABS: TabEntry[] = [
  { name: 'FileIcon.tsx', path: 'components/FileIcon.tsx', category: 'ui' },
  { name: 'TreeNode.tsx', path: 'components/TreeNode.tsx', category: 'ui' },
];

const TERM_TABS: TerminalSession[] = [
  { id: 'bash', name: 'bash', status: 'active', icon: icons.Terminal },
  { id: 'zsh', name: 'zsh', status: 'idle', icon: icons.Terminal },
  { id: 'vestara', name: 'vestara', status: 'active', icon: icons.Sparkles },
  { id: 'logs', name: 'logs', status: 'error', icon: icons.FileText },
];

const PALETTE_RESULTS: FileIndexEntry[] = [
  { name: 'FileIcon.tsx', path: 'components/FileIcon.tsx', category: 'ui' },
  { name: 'AGENTS.md', path: 'AGENTS.md', category: 'docs' },
  { name: 'package.json', path: 'package.json', category: 'config' },
];

const CONVERSATIONS: Conversation[] = [
  { id: '1', title: 'Merge component library', preview: 'Build the merged unified…', time: '2m', status: 'active', unread: 2 },
  { id: '2', title: 'Design tokens audit', preview: 'Check teal vs cyan usage…', time: '1h', status: 'idle' },
  { id: '3', title: 'API routes refactor', preview: 'Routes.ts needs cleanup', time: '3h', status: 'alert' },
];

const MESSAGES: ChatMessageData[] = [
  { id: 'm1', role: 'assistant', text: 'VESTARA OS initialised. 51 components merged into one token system.', time: '09:41' },
  { id: 'm2', role: 'user', text: 'Show me the FileIcon mapping.', time: '09:42' },
];

const TESTS: TestRow[] = [
  { name: 'FileIcon renders', status: 'pass', time: '12ms' },
  { name: 'TreeNode recursion', status: 'pass', time: '8ms' },
  { name: 'CommandPalette filter', status: 'run', time: '…' },
];

const PROPS: PropRow[] = [
  { prop: 'category', type: "'code' | 'docs' | 'ui'", default: 'ui', desc: 'Icon variant mapping' },
  { prop: 'open', type: 'boolean', default: 'false', desc: 'Folder open state' },
];

const SAMPLE_CODE = `export function FileIcon({ category = 'other', open }: FileIconProps) {\n  return <Icon category={category} open={open} />;\n}`;

// ─── Preview primitives ────────────────────────────────────────

function PreviewFrame({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-4">{children}</div>;
}

function ChipPreview() {
  const [value, setValue] = useState('All');
  return <FilterChips value={value} options={CHIP_OPTIONS} onChange={setValue} />;
}

function TreePreview() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/src']));
  const [active, setActive] = useState('/src/components/FileIcon.tsx');
  return (
    <div className="w-full max-w-[340px] rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-2">
      <TreeNode
        node={FILE_TREE}
        activePath={active}
        expandedPaths={expanded}
        onToggle={(path) =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
          })
        }
        onSelect={setActive}
      />
    </div>
  );
}

function SearchPreview() {
  const [value, setValue] = useState('');
  return (
    <div className="w-full max-w-[360px]">
      <SearchInput value={value} onChange={setValue} placeholder="Filter components…" />
    </div>
  );
}

function PalettePreview() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-[9px] bg-[var(--vestara-accent-os-teal)] px-4 text-[13px] font-semibold text-[var(--vestara-color-os-on-accent)]"
      >
        Open Command Palette <icons.Command className="h-4 w-4" />
      </button>
      <CommandPalette
        open={open}
        query={query}
        onQuery={setQuery}
        onClose={() => setOpen(false)}
        results={PALETTE_RESULTS.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))}
        onSelect={() => setOpen(false)}
      />
    </div>
  );
}

function TabBarPreview() {
  const [active, setActive] = useState(TABS[0].path);
  const [tabs, setTabs] = useState(TABS);
  return (
    <div className="w-full overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)]">
      <TabBar tabs={tabs} active={active} onActive={setActive} onClose={(path) => setTabs((t) => t.filter((x) => x.path !== path))} />
    </div>
  );
}

function ModelPreview() {
  const [value, setValue] = useState(MODEL_OPTIONS[0]);
  return <ModelSelector value={value} options={MODEL_OPTIONS} onChange={setValue} />;
}

function ConversationPreview() {
  const [active, setActive] = useState('1');
  return (
    <div className="w-full max-w-[360px] space-y-1">
      {CONVERSATIONS.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={active === conversation.id}
          onSelect={() => setActive(conversation.id)}
        />
      ))}
    </div>
  );
}

function ComposerPreview() {
  const [value, setValue] = useState('');
  return (
    <div className="w-full max-w-[520px]">
      <Composer value={value} onChange={setValue} onSend={() => setValue('')} />
    </div>
  );
}

function SidebarPreview() {
  const [open, setOpen] = useState(false);
  return <Sidebar open={open} onToggle={() => setOpen((v) => !v)} conversations={CONVERSATIONS} />;
}

function PassphrasePreview() {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  return (
    <div className="w-full max-w-[520px]">
      <PassphraseInput value={value} onChange={setValue} show={show} onToggleShow={() => setShow((v) => !v)} />
    </div>
  );
}

function HardwarePreview() {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'found'>('idle');
  return (
    <div className="w-full max-w-[520px]">
      <HardwareKeyCard
        status={status}
        onScan={() => {
          setStatus('scanning');
          window.setTimeout(() => setStatus('found'), 1200);
        }}
      />
    </div>
  );
}

function RecoveryPreview() {
  const [words, setWords] = useState<string[]>(Array.from({ length: 12 }, () => ''));
  return (
    <div className="w-full max-w-[520px]">
      <RecoveryGrid
        words={words}
        onChange={(index, value) => setWords((prev) => prev.map((word, i) => (i === index ? value : word)))}
      />
    </div>
  );
}

function AvatarPreview() {
  const [name, setName] = useState('Alex Rivera');
  const [colorIndex, setColorIndex] = useState(0);
  return (
    <div className="flex items-start gap-6">
      <AvatarBox name={name} colorIndex={colorIndex} onColorChange={setColorIndex} />
      <div className="w-[200px]">
        <DisplayNameInput value={name} onChange={setName} />
      </div>
    </div>
  );
}

function SeedPreview() {
  const [blurred, setBlurred] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full max-w-[520px]">
      <SeedGrid
        words={SEED_WORDS}
        blurred={blurred}
        onToggleBlur={() => setBlurred((v) => !v)}
        onCopy={() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        copied={copied}
      />
    </div>
  );
}

function StoragePreview() {
  const [selected, setSelected] = useState('portable');
  return (
    <div className="grid w-full max-w-[520px] gap-3">
      <StorageOptionCard
        title="Portable SSD"
        desc="Boot on any x86_64 device via USB-C"
        badge="RECOMMENDED"
        icon={icons.HardDrive}
        selected={selected === 'portable'}
        onSelect={() => setSelected('portable')}
      />
      <StorageOptionCard
        title="Internal Test"
        desc="Install to internal drive for dev evaluation"
        badge="DEV"
        icon={icons.Server}
        selected={selected === 'internal'}
        onSelect={() => setSelected('internal')}
      />
    </div>
  );
}

function ProviderPreview() {
  const [selected, setSelected] = useState('opencode');
  return (
    <div className="grid w-full max-w-[520px] gap-3">
      <ProviderCard
        title="OpenCode"
        desc="Works without API keys • local WASM runtime"
        meta="NO_KEY_REQUIRED • 4.2GB"
        icon={icons.Zap}
        selected={selected === 'opencode'}
        onSelect={() => setSelected('opencode')}
        isDefault
      />
      <ProviderCard
        title="Ollama on-demand"
        desc="Launch only when needed — no background daemon"
        meta="ON_DEMAND • ~6GB MODELS"
        icon={icons.Box}
        selected={selected === 'ollama'}
        onSelect={() => setSelected('ollama')}
      />
    </div>
  );
}

function ConnectionPreview() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  return (
    <ConnectionTestButton
      status={status}
      onTest={() => {
        setStatus('testing');
        window.setTimeout(() => setStatus('ok'), 1000);
      }}
    />
  );
}

function ExtensionPreview() {
  const [selected, setSelected] = useState(true);
  return (
    <div className="w-full max-w-[520px]">
      <ExtensionCard
        title="Project Manager"
        desc="Kanban + milestones + AI task breakdown"
        icon={icons.Layers}
        size="12.4 MB"
        vers="v2.1.0"
        selected={selected}
        onToggle={() => setSelected((v) => !v)}
      />
    </div>
  );
}

function StepPreview() {
  const [step, setStep] = useState(3);
  return (
    <div className="w-full max-w-[520px] space-y-3">
      <StepProgress step={step} total={5} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} className="rounded bg-[var(--vestara-color-os-inverse)]/10 px-3 py-1 text-[11px] text-[var(--vestara-text-os-primary)]">
          Prev
        </button>
        <button type="button" onClick={() => setStep((s) => Math.min(5, s + 1))} className="rounded bg-[var(--vestara-color-os-inverse)] px-3 py-1 text-[11px] text-[var(--vestara-color-os-auth-canvas)]">
          Next
        </button>
      </div>
    </div>
  );
}

function SecureBootPreview() {
  const [enabled, setEnabled] = useState(true);
  return <SecureBootToggle enabled={enabled} onToggle={() => setEnabled((v) => !v)} />;
}

function MethodTabsPreview() {
  const [method, setMethod] = useState<'passphrase' | 'hardware' | 'recovery'>('passphrase');
  const [tracer, setTracer] = useState({ m: '', t: '' });
  return (
    <div className="w-full max-w-[520px] space-y-3">
      <div className="flex justify-center">
        <TracerBadge method={tracer.m} ts={tracer.t} />
      </div>
      <MethodTabs value={method} onChange={setMethod} onTracer={(m) => setTracer({ m, t: new Date().toLocaleTimeString() })} />
    </div>
  );
}

function WorkspaceTabsPreview() {
  const [active, setActive] = useState('Files');
  return <WorkspaceTabs active={active} onActive={setActive} />;
}

function TerminalDrawerPreview() {
  const [height, setHeight] = useState(300);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="w-full overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)]">
      <TerminalDrawer
        height={height}
        onHeightChange={setHeight}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        sessionCount={3}
        lastCommand="ls"
        onSearch={() => {}}
        onSplitH={() => {}}
        onSplitV={() => {}}
        onMaximize={() => {}}
        onClear={() => {}}
      >
        <TerminalPane />
      </TerminalDrawer>
    </div>
  );
}

function TerminalTabsPreview() {
  const [activeId, setActiveId] = useState('bash');
  const [tabs, setTabs] = useState(TERM_TABS);
  return (
    <div className="w-full overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)]">
      <TerminalTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={(id) => setTabs((current) => current.filter((tab) => tab.id !== id))}
        onNew={() => {}}
      />
    </div>
  );
}

function TerminalPanePreview() {
  return (
    <div className="flex h-[320px] w-full flex-col overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)]">
      <TerminalPane />
    </div>
  );
}

function SplitViewPreview() {
  return (
    <div className="flex h-[320px] w-full flex-col overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)]">
      <SplitView leftPane={<TerminalPane id="left" />} rightPane={<TerminalPane id="right" cwd="~/marketplace/logs" />} />
    </div>
  );
}

function TerminalSuggestPreview() {
  const [query, setQuery] = useState('git');
  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-3">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Type a command…"
        aria-label="Suggest query"
        className="h-8 w-full rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-canvas)] px-3 font-mono text-[12px] text-[var(--vestara-text-os-primary)] outline-none placeholder:text-[var(--vestara-text-os-faint)]"
      />
      <TerminalSuggest query={query} visible onSelect={() => {}} onClose={() => {}} />
    </div>
  );
}

function DrawerPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-[9px] bg-[var(--vestara-accent)] px-4 text-[13px] font-semibold text-[var(--vestara-on-accent)]"
      >
        Open Drawer <icons.PanelBottomOpen className="h-4 w-4" />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Inspector" storageKey="preview-drawer">
        <p className="p-4 font-mono text-[12px] text-[var(--vestara-text-secondary)]">
          Resizable slide-over — drag the edge, pick a preset, or press Escape.
        </p>
      </Drawer>
    </div>
  );
}

function DrawerMenuPreview() {
  return (
    <DrawerMenu
      actions={[
        { id: 'normal', label: 'Normal size', checked: true },
        { id: 'full', label: 'Full size' },
        { id: 'sep', label: '', divider: true },
        { id: 'close', label: 'Close drawer' },
      ]}
      onSelect={() => {}}
    />
  );
}

function ModalPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-[9px] bg-[var(--vestara-accent)] px-4 text-[13px] font-semibold text-[var(--vestara-on-accent)]"
      >
        Open Modal <icons.Maximize2 className="h-4 w-4" />
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} ariaLabel="Preview dialog">
          <p className="p-5 font-mono text-[12px] text-[var(--vestara-text-secondary)]">
            Focus-trapped dialog — Tab cycles inside, Escape closes.
          </p>
        </Modal>
      )}
    </div>
  );
}

function OperationalPanelPreview() {
  return (
    <OperationalPanel
      icon={<icons.Zap />}
      title="Runtime"
      description="Live services backing this workspace"
      tone="info"
      actions={<span className="font-mono text-[10px] text-[var(--vestara-text-muted)]">3 live</span>}
    >
      <p className="font-mono text-[12px] text-[var(--vestara-text-secondary)]">
        Icon / title / description / actions card — replaces SectionCard stacks.
      </p>
    </OperationalPanel>
  );
}

function StatCardPreview() {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      <StatCard label="Running" value={4} accent="var(--vestara-status-success)" />
      <StatCard label="Blocked" value={1} sub="needs review" accent="var(--vestara-status-error)" compact />
    </div>
  );
}

function ProgressBarPreview() {
  return (
    <div className="w-full space-y-2">
      <ProgressBar pct={82} size="md" />
      <ProgressBar pct={45} />
      <ProgressBar pct={12} size="lg" />
    </div>
  );
}

// ─── Registry ──────────────────────────────────────────────────

export const COMPONENT_PREVIEWS: Record<string, () => ReactNode> = {
  // file workspace
  FileIcon: () => (
    <PreviewFrame>
      <FileIcon category="folder" className="h-5 w-5" />
      <FileIcon category="folder" open className="h-5 w-5" />
      <FileIcon category="code" className="h-5 w-5" />
      <FileIcon category="docs" className="h-5 w-5" />
      <FileIcon category="config" className="h-5 w-5" />
      <FileIcon category="data" className="h-5 w-5" />
    </PreviewFrame>
  ),
  TreeNode: TreePreview,
  FilterChips: ChipPreview,
  SearchInput: SearchPreview,
  CommandPalette: PalettePreview,
  TabBar: TabBarPreview,
  Breadcrumb: () => <Breadcrumb path="components/FileIcon.tsx" onFocusFolder={() => {}} />,
  CodeViewer: () => <CodeViewer code={SAMPLE_CODE} className="w-full" />,
  DetailCard: () => <DetailCard node={{ name: 'FileIcon.tsx', path: 'components/FileIcon.tsx', type: 'file', category: 'ui', size: '1.2 KB' }} onCopyPath={() => {}} onPin={() => {}} />,
  ActionGrid: () => <ActionGrid onAction={() => {}} />,
  GitStatusCard: () => <GitStatusCard onViewDiff={() => {}} />,
  Toast: () => <Toast message="Copied to clipboard" show />,

  // chat assistant
  AppHeader: () => <AppHeader />,
  ModelSelector: ModelPreview,
  NewChatButton: () => <NewChatButton onClick={() => {}} />,
  ConversationItem: ConversationPreview,
  ConversationGroup: () => <ConversationGroup label="TODAY" count={3} />,
  OsUnitsCard: () => <OsUnitsCard />,
  WorkspaceTabs: WorkspaceTabsPreview,
  ChatMessage: () => (
    <div className="w-full max-w-[520px] space-y-3">
      {MESSAGES.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
    </div>
  ),
  ArchitectureCard: () => <ArchitectureCard />,
  GapCard: () => <GapCard />,
  TestSuiteCard: () => <TestSuiteCard tests={TESTS} />,
  Composer: ComposerPreview,
  TypingIndicator: () => <TypingIndicator />,
  Sidebar: SidebarPreview,

  // auth & onboarding
  MethodTabs: MethodTabsPreview,
  TracerBadge: () => <TracerBadge method="passphrase" ts="10:23:11" />,
  PassphraseInput: PassphrasePreview,
  HardwareKeyCard: HardwarePreview,
  RecoveryGrid: RecoveryPreview,
  AvatarBox: AvatarPreview,
  SeedGrid: SeedPreview,
  DisplayNameInput: () => <DisplayNameInput value="Alex Rivera" onChange={() => {}} />,
  StorageOptionCard: StoragePreview,
  ABPartitionLayout: () => <ABPartitionLayout />,
  SecureBootToggle: SecureBootPreview,
  ProviderCard: ProviderPreview,
  ConnectionTestButton: ConnectionPreview,
  ExtensionCard: ExtensionPreview,
  RuntimeNotice: () => <RuntimeNotice />,
  StepProgress: StepPreview,
  OnboardingShell: () => (
    <OnboardingShell step={3} title="SSD Setup">
      <p className="text-[13px] text-[var(--vestara-text-os-secondary)]">
        Shell content — put any onboarding step inside.
      </p>
    </OnboardingShell>
  ),

  // data display
  CodeBlock: () => <CodeBlock code={SAMPLE_CODE} />,
  PropTable: () => <PropTable rows={PROPS} />,

  // workspace chrome
  Drawer: DrawerPreview,
  DrawerMenu: DrawerMenuPreview,
  Modal: ModalPreview,
  OperationalPanel: OperationalPanelPreview,
  StatCard: StatCardPreview,
  ProgressBar: ProgressBarPreview,

  // terminal drawer
  TerminalDrawer: TerminalDrawerPreview,
  TerminalTabs: TerminalTabsPreview,
  TerminalPane: TerminalPanePreview,
  SplitView: SplitViewPreview,
  TerminalSuggest: TerminalSuggestPreview,
  CollapsedBar: () => <CollapsedBar sessionCount={3} lastCommand="vestara status" onExpand={() => {}} />,
};

export { PartitionCard };
