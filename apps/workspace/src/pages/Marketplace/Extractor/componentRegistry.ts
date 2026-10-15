/**
 * VESTARA Extractor — verified component registry (Phase 1.1).
 *
 * Transcribed from the reference `artifact.html` (single-file React
 * artifact: React 18.3.1 + Tailwind v3.4.18, Instrument Sans + Geist Mono).
 * Each key is the original minified bundle var; each value is the verified
 * reconstruction (name, category, props, description).
 *
 * Coverage: 44 demoed primitives (12 file-workspace + 15 chat-assistant +
 * 17 auth/onboarding) plus bundle infrastructure the demos are built from
 * (PropTable, CodeBlock, PartitionCard) and the gallery shell itself
 * (SectionHeader, DemoSection, LoginOnboardingDemo, App).
 *
 * A future artifact with different minification gets different vars — those
 * vars stay unmapped (counted as `unmappedVarCount`) rather than guessed.
 * Extend this table when a new artifact is profiled.
 */

import type { ExtractorCategory, ExtractedProp } from './types.js';

export interface RegistryEntry {
  readonly name: string;
  readonly file: string;
  readonly category: ExtractorCategory;
  readonly description: string;
  readonly props: readonly ExtractedProp[];
}

type P = readonly ExtractedProp[];

function prop(name: string, type: string, defaultValue: string, description: string): ExtractedProp {
  return { name, type, defaultValue, description };
}

function entry(
  name: string,
  category: ExtractorCategory,
  description: string,
  props: P = [],
): RegistryEntry {
  return { name, file: `${name}.tsx`, category, description, props };
}

const HANDLER = '(v) => void';
const NO_PROPS: P = [];

export const COMPONENT_REGISTRY: Record<string, RegistryEntry> = {
  // ── File workspace (12 demos) ──────────────────────────────────
  Je: entry('FileIcon', 'ui', 'Maps file category to lucide icon with open state for folders.', [
    prop('category', 'FileCategory', 'other', 'code | docs | config | folder | data'),
    prop('open', 'boolean', 'false', 'Only for the folder category'),
    prop('className', 'string', '14px', 'Tailwind size override'),
  ]),
  Tp: entry('TreeNode', 'ui', 'Recursive folder/file row with 14px depth indent, chevron, and fileCount badge.', [
    prop('node', 'FileNode', '—', 'File/folder with children'),
    prop('depth', 'number', '0', 'Indent level'),
    prop('activePath', 'string', '—', 'Current selected path'),
    prop('expandedPaths', 'Set<string>', '—', 'Expanded folder paths'),
  ]),
  Qy: entry('FilterChips', 'ui', 'Pill filter row with active teal state.', [
    prop('value', 'string', '—', 'Active chip'),
    prop('options', 'string[]', '—', 'Chip labels'),
    prop('onChange', HANDLER, '—', 'Select handler'),
  ]),
  Pp: entry('SearchInput', 'ui', 'Icon input with mono placeholder and teal focus ring.', [
    prop('value', 'string', '—', 'Controlled value'),
    prop('placeholder', 'string', 'Search...', 'Mono placeholder'),
    prop('onChange', HANDLER, '—', 'Change handler'),
    prop('onFocus', '() => void', '—', 'Focus handler'),
  ]),
  By: entry('CommandPalette', 'ui', 'Modal with backdrop blur and indexed results. Opens on focus, closes on ESC.', [
    prop('open', 'boolean', '—', 'Visible state'),
    prop('query', 'string', '—', 'Search query'),
    prop('results', 'FileIndex[]', '—', 'Filtered results'),
    prop('onSelect', '(path) => void', '—', 'Select file'),
  ]),
  Ay: entry('TabBar', 'ui', 'Scrollable tabs with active teal dot, file icon, and close X.', [
    prop('tabs', 'Tab[]', '—', 'Open tabs'),
    prop('active', 'string', '—', 'Active path'),
    prop('onActive', '(path) => void', '—', 'Select tab'),
    prop('onClose', '(path) => void', '—', 'Close tab'),
  ]),
  Yy: entry('Breadcrumb', 'ui', 'Path with chevrons and a highlighted last segment.', [
    prop('path', 'string', '—', 'Full file path'),
    prop('onFocusFolder', '(path) => void', '—', 'Focus folder callback'),
  ]),
  Ky: entry('CodeViewer', 'code', 'Gutter line numbers, tinted code, and minimap bars on xl screens.', [
    prop('code', 'string', '—', 'File content'),
  ]),
  Xy: entry('DetailCard', 'docs', 'File preview with icon, meta, and hover-reveal path copy.', [
    prop('node', 'FileNode', '—', 'File to display'),
    prop('onCopyPath', '() => void', '—', 'Copy path action'),
    prop('onPin', '() => void', '—', 'Pin file'),
  ]),
  Zy: entry('ActionGrid', 'ui', 'Two-column actions with a danger variant for Delete.', [
    prop('onAction', '(label: string) => void', '—', 'Triggered on click'),
  ]),
  Np: entry('GitStatusCard', 'docs', 'Branch badge, modified/clean state, insertions and deletions.', [
    prop('branch', 'string', 'main', 'Branch name'),
    prop('modified', 'boolean', 'true', 'Dirty state'),
    prop('insertions', 'number', '—', 'Lines added'),
    prop('deletions', 'number', '—', 'Lines removed'),
  ]),
  Jy: entry('Toast', 'ui', 'Bottom-center pulse-dot notification.', [
    prop('message', 'string', '—', 'Text'),
    prop('show', 'boolean', '—', 'Visible'),
  ]),
  // ── Bundle infrastructure (used by, but not demoed in, the gallery) ──
  Wy: entry('PropTable', 'docs', 'PROP | TYPE | DEFAULT | DESC grid with responsive columns.', [
    prop('rows', 'PropRow[]', '—', 'Table rows'),
  ]),
  Hy: entry('CodeBlock', 'code', 'Snippet card with hover Copy button.', [
    prop('code', 'string', '—', 'Code text'),
    prop('onCopy', '() => void', '—', 'Copy callback'),
  ]),
  // ── Chat assistant (14 new vars; chat-search reuses Pp) ─────────
  Gy: entry('AppHeader', 'ui', 'Top bar with gradient V logo, LIVE pulse dot, and settings.', NO_PROPS),
  qy: entry('ModelSelector', 'ui', 'Dropdown with CPU icon and rotating chevron.', [
    prop('value', 'string', '—', 'Selected model'),
    prop('onChange', HANDLER, '—', 'Change model'),
  ]),
  xy: entry('NewChatButton', 'ui', 'Cyan solid CTA with Plus icon and glow shadow.', [
    prop('onClick', '() => void', '—', 'Create new chat'),
  ]),
  by: entry('ConversationItem', 'ui', 'Row with status dot, title, mono preview, time, and unread badge.', [
    prop('conv', 'Conv', '—', 'Conversation data'),
    prop('active', 'boolean', '—', 'Active state'),
    prop('onSelect', '() => void', '—', 'Select conversation'),
  ]),
  kf: entry('ConversationGroup', 'docs', 'Section label with mono count badge and divider line.', [
    prop('label', 'string', '—', 'Group label'),
    prop('count', 'number', '—', 'Items in group'),
  ]),
  jy: entry('OsUnitsCard', 'docs', 'Gradient status card with CORE / MEM / NET units.', NO_PROPS),
  ev: entry('WorkspaceTabs', 'ui', 'Files | Code | Canvas | Terminal pill tabs.', [
    prop('active', 'string', '—', 'Active tab'),
    prop('onActive', HANDLER, '—', 'Switch tab'),
  ]),
  nv: entry('ChatMessage', 'ui', 'Cyan user bubble versus dark assistant row.', [
    prop('msg', 'Msg', '—', 'Message data'),
  ]),
  tv: entry('ArchitectureCard', 'docs', 'Layered Interface → Core → Storage diagram.', NO_PROPS),
  rv: entry('GapCard', 'docs', 'Before/after merge comparison with emphasis toggle.', NO_PROPS),
  lv: entry('TestSuiteCard', 'docs', 'Pass / running / fail rows with mono timings.', NO_PROPS),
  uv: entry('Composer', 'ui', 'Textarea with teal focus ring and Send button.', [
    prop('value', 'string', '—', 'Text'),
    prop('onChange', HANDLER, '—', 'Change'),
    prop('onSend', '() => void', '—', 'Send message'),
  ]),
  Cp: entry('TypingIndicator', 'ui', 'Three staggered bounce dots with thinking label.', NO_PROPS),
  iv: entry('Sidebar', 'ui', 'Toggle drawer with workspace navigation.', [
    prop('open', 'boolean', '—', 'Drawer open'),
    prop('onToggle', '() => void', '—', 'Toggle'),
  ]),
  // ── Auth & onboarding (17 sections + PartitionCard infra) ───────
  Dp: entry('MethodTabs', 'ui', 'Passphrase / Hardware Key / Recovery method grid.', [
    prop('value', 'string', '—', 'Active method'),
    prop('onChange', HANDLER, '—', 'Change method'),
    prop('onTracer', '(m) => void', '—', 'Tracer update'),
  ]),
  wf: entry('TracerBadge', 'ui', 'Tiny mono tracer pill showing the last method and timestamp.', [
    prop('method', 'string', '—', 'Active method id'),
    prop('ts', 'string', '—', 'Timestamp'),
  ]),
  $p: entry('PassphraseInput', 'ui', 'Local passphrase input with eye toggle and AES badge.', [
    prop('value', 'string', '—', 'Passphrase'),
    prop('show', 'boolean', '—', 'Show plain text'),
    prop('onToggleShow', '() => void', '—', 'Toggle eye'),
  ]),
  Lp: entry('HardwareKeyCard', 'ui', 'Secure-boot key card with idle / scanning / found states.', [
    prop('status', "'idle' | 'scanning' | 'found'", '—', 'Scan state'),
    prop('onScan', '() => void', '—', 'Trigger scan'),
  ]),
  Up: entry('RecoveryGrid', 'ui', 'Twelve numbered seed inputs with amber warning banner.', [
    prop('words', 'string[12]', '—', 'Twelve words'),
    prop('onChange', '(i, v) => void', '—', 'Update word'),
  ]),
  Ip: entry('AvatarBox', 'ui', 'Gradient avatar with V badge and color picker.', [
    prop('name', 'string', '—', 'Display name'),
    prop('colorIndex', 'number', '—', 'Gradient 0–3'),
    prop('onColorChange', '(i) => void', '—', 'Pick color'),
  ]),
  Qp: entry('DisplayNameInput', 'ui', 'Builder-name input.', [
    prop('value', 'string', '—', 'Name'),
    prop('onChange', HANDLER, '—', 'Update'),
  ]),
  Wp: entry('SeedGrid', 'ui', 'Blur-toggleable seed grid with copy button.', [
    prop('words', 'string[]', '—', 'Twelve words'),
    prop('blurred', 'boolean', '—', 'Blur state'),
    prop('onToggleBlur', '() => void', '—', 'Toggle blur'),
    prop('onCopy', '() => void', '—', 'Copy action'),
    prop('copied', 'boolean', '—', 'Copied flag'),
  ]),
  pl: entry('StorageOptionCard', 'ui', 'Portable / internal / VM radio card with badge.', [
    prop('id', 'string', '—', 'Option id'),
    prop('title', 'string', '—', 'Title'),
    prop('desc', 'string', '—', 'Description'),
    prop('badge', 'string', '—', 'RECOMMENDED / DEV / VM'),
    prop('selected', 'boolean', '—', 'Selected state'),
    prop('onSelect', '() => void', '—', 'Select'),
  ]),
  Op: entry('PartitionCard', 'docs', 'Single A/B partition readout with seal bar.', [
    prop('dev', 'string', '—', 'Device path'),
    prop('pct', 'number', '—', 'Usage percent'),
    prop('active', 'boolean', '—', 'ACTIVE flag'),
  ]),
  Hp: entry('ABPartitionLayout', 'docs', 'vestara_a ACTIVE versus vestara_b standby pair.', NO_PROPS),
  Bp: entry('SecureBootToggle', 'ui', 'Switch with TPM2-sealed storage badge.', [
    prop('enabled', 'boolean', '—', 'Secure boot on'),
    prop('onToggle', '() => void', '—', 'Toggle'),
  ]),
  sl: entry('ProviderCard', 'ui', 'opencode / ollama / byok radio card with meta badge.', [
    prop('id', 'string', '—', 'Provider id'),
    prop('title', 'string', '—', 'Title'),
    prop('desc', 'string', '—', 'Description'),
    prop('meta', 'string', '—', 'Badge text'),
    prop('selected', 'boolean', '—', 'Active provider'),
    prop('onSelect', '() => void', '—', 'Select'),
  ]),
  Ap: entry('ConnectionTestButton', 'ui', 'idle / testing / ok / fail connection states.', [
    prop('status', "'idle' | 'testing' | 'ok' | 'fail'", '—', 'Connection state'),
    prop('onTest', '() => void', '—', 'Run test'),
  ]),
  yl: entry('ExtensionCard', 'ui', 'Selectable starter-pack card with size and version.', [
    prop('id', 'string', '—', 'Pack id'),
    prop('title', 'string', '—', 'Title'),
    prop('desc', 'string', '—', 'Description'),
    prop('size', 'string', '—', 'e.g. 12.4 MB'),
    prop('vers', 'string', '—', 'e.g. v2.1.0'),
    prop('selected', 'boolean', '—', 'Installed'),
    prop('onToggle', '() => void', '—', 'Toggle'),
  ]),
  Yp: entry('RuntimeNotice', 'docs', 'Single-authority extension-runtime notice.', NO_PROPS),
  Kp: entry('StepProgress', 'ui', 'Onboarding progress bar with step dots.', [
    prop('step', 'number', '—', 'Current step'),
    prop('total', 'number', '—', 'Total steps'),
  ]),
  ov: entry('OnboardingShell', 'ui', 'Numbered onboarding card shell with footer.', [
    prop('step', 'number', '—', 'Step number'),
    prop('title', 'string', '—', 'Title'),
  ]),
  // ── Gallery shell ──────────────────────────────────────────────
  fv: entry('LoginOnboardingDemo', 'ui', 'Full login plus five-step onboarding flow demo.', [
    prop('onToast', '(msg) => void', '—', 'Toast callback'),
  ]),
  Au: entry('SectionHeader', 'docs', 'Count-badge section header.', [
    prop('label', 'string', '—', 'Section label'),
    prop('count', 'number', '—', 'Component count'),
  ]),
  x: entry('DemoSection', 'docs', 'Numbered demo with description, live preview, props, and code.', [
    prop('title', 'string', '—', 'Component title'),
    prop('code', 'string', '—', 'Copy-ready snippet'),
  ]),
  Ef: entry('App', 'ui', 'Unified 44-component demo gallery root.', NO_PROPS),
};
