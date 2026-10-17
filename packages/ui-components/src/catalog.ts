/**
 * @vestara/ui-components — Component catalog authority.
 *
 * Machine-readable manifest of every exported component, grouped by the
 * reference artifact section it was extracted from. Consumed by the
 * marketplace UI Components gallery and by catalog/asset fixtures so the
 * component list is never duplicated as inline arrays in JSX
 * (UI-UX governance §6).
 */

export type UiComponentGroup =
  | 'file-workspace'
  | 'chat-assistant'
  | 'auth-onboarding'
  | 'data-display'
  | 'terminal-drawer'
  | 'workspace-chrome';

export interface UiComponentEntry {
  /** Stable id / exported symbol name. */
  readonly id: string;
  /** Human label for gallery cards. */
  readonly name: string;
  readonly group: UiComponentGroup;
  readonly description: string;
  readonly category: 'code' | 'docs' | 'config' | 'data' | 'ui';
}

export const UI_COMPONENT_GROUPS: readonly { id: UiComponentGroup; label: string; description: string }[] = [
  {
    id: 'file-workspace',
    label: 'File Workspace',
    description: 'File browser primitives: navigation, search, preview, actions.',
  },
  {
    id: 'chat-assistant',
    label: 'Chat Assistant',
    description: 'Assistant chrome: header, models, conversations, messages, cards, composer.',
  },
  {
    id: 'auth-onboarding',
    label: 'Auth & Onboarding',
    description: 'Login and onboarding: auth methods, recovery, partitions, providers, extensions.',
  },
  {
    id: 'data-display',
    label: 'Data Display',
    description: 'Code and reference tables: code blocks and prop tables.',
  },
  {
    id: 'terminal-drawer',
    label: 'Terminal Drawer',
    description: 'Bottom drawer terminal: shell, session tabs, panes, splits, autocomplete.',
  },
  {
    id: 'workspace-chrome',
    label: 'Workspace Chrome',
    description: 'Global overlay and card surfaces: drawer, modal, operational panel, stats.',
  },
];

export const UI_COMPONENT_CATALOG: readonly UiComponentEntry[] = [
  // ── File workspace (12) ──
  {
    id: 'FileIcon',
    name: 'FileIcon',
    group: 'file-workspace',
    category: 'ui',
    description: 'Maps a file category to a vendored icon with token tints.',
  },
  {
    id: 'TreeNode',
    name: 'TreeNode',
    group: 'file-workspace',
    category: 'ui',
    description: 'Recursive folder/file row with depth indent and expand/collapse.',
  },
  {
    id: 'FilterChips',
    name: 'FilterChips',
    group: 'file-workspace',
    category: 'ui',
    description: 'Pill filter with an active teal state.',
  },
  {
    id: 'SearchInput',
    name: 'SearchInput',
    group: 'file-workspace',
    category: 'ui',
    description: 'Icon input with mono placeholder, clear action, teal focus.',
  },
  {
    id: 'CommandPalette',
    name: 'CommandPalette',
    group: 'file-workspace',
    category: 'ui',
    description: 'Modal command/search surface with indexed results and ESC-to-close.',
  },
  {
    id: 'TabBar',
    name: 'TabBar',
    group: 'file-workspace',
    category: 'ui',
    description: 'Scrollable tabs with an active dot, icon and close action.',
  },
  {
    id: 'Breadcrumb',
    name: 'Breadcrumb',
    group: 'file-workspace',
    category: 'ui',
    description: 'Path breadcrumb with chevrons and an open-folder action.',
  },
  {
    id: 'CodeViewer',
    name: 'CodeViewer',
    group: 'file-workspace',
    category: 'code',
    description: 'Gutter with line numbers, mono code, and a minimap.',
  },
  {
    id: 'DetailCard',
    name: 'DetailCard',
    group: 'file-workspace',
    category: 'ui',
    description: 'File preview with icon, meta, and copy-path reveal.',
  },
  {
    id: 'ActionGrid',
    name: 'ActionGrid',
    group: 'file-workspace',
    category: 'ui',
    description: '2-column file actions with a danger variant for Delete.',
  },
  {
    id: 'GitStatusCard',
    name: 'GitStatusCard',
    group: 'file-workspace',
    category: 'ui',
    description: 'Branch badge, modified state, insertions/deletions, view diff.',
  },
  {
    id: 'Toast',
    name: 'Toast',
    group: 'file-workspace',
    category: 'ui',
    description: 'Bottom-center pill toast with a pulse dot and timestamp.',
  },

  // ── Chat assistant (14) ──
  {
    id: 'AppHeader',
    name: 'AppHeader',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Top bar with gradient logo and a LIVE pulse dot.',
  },
  {
    id: 'ModelSelector',
    name: 'ModelSelector',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Model dropdown with CPU icon and teal active state.',
  },
  {
    id: 'NewChatButton',
    name: 'NewChatButton',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Primary cyan call-to-action with a plus icon.',
  },
  {
    id: 'ConversationItem',
    name: 'ConversationItem',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Conversation row with status dot, preview, time, and unread badge.',
  },
  {
    id: 'ConversationGroup',
    name: 'ConversationGroup',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Section label with count badge and divider.',
  },
  {
    id: 'OsUnitsCard',
    name: 'OsUnitsCard',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Gradient OS status card with three units.',
  },
  {
    id: 'WorkspaceTabs',
    name: 'WorkspaceTabs',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Inset pill tabs: Files / Code / Canvas / Terminal.',
  },
  {
    id: 'ChatMessage',
    name: 'ChatMessage',
    group: 'chat-assistant',
    category: 'ui',
    description: 'User (cyan) vs assistant (dark) message bubble.',
  },
  {
    id: 'ArchitectureCard',
    name: 'ArchitectureCard',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Layered architecture diagram with connector and dots.',
  },
  {
    id: 'GapCard',
    name: 'GapCard',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Before/after comparison with a toggle.',
  },
  {
    id: 'TestSuiteCard',
    name: 'TestSuiteCard',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Test rows with pass / running / fail status and time.',
  },
  {
    id: 'Composer',
    name: 'Composer',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Textarea composer with a teal send button; Enter to send.',
  },
  {
    id: 'TypingIndicator',
    name: 'TypingIndicator',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Three staggered bounce dots with a sparkles glyph.',
  },
  {
    id: 'Sidebar',
    name: 'Sidebar',
    group: 'chat-assistant',
    category: 'ui',
    description: 'Toggleable workspace drawer with conversation nav.',
  },

  // ── Auth & onboarding (17) ──
  {
    id: 'MethodTabs',
    name: 'MethodTabs',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Passphrase / Hardware / Recovery tab selector.',
  },
  {
    id: 'TracerBadge',
    name: 'TracerBadge',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Mono tracer badge showing the active method and time.',
  },
  {
    id: 'PassphraseInput',
    name: 'PassphraseInput',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Passphrase field with reveal toggle and AES badge.',
  },
  {
    id: 'HardwareKeyCard',
    name: 'HardwareKeyCard',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Hardware key card with idle / scanning / found states.',
  },
  {
    id: 'RecoveryGrid',
    name: 'RecoveryGrid',
    group: 'auth-onboarding',
    category: 'ui',
    description: '12-word recovery seed inputs with a warning banner.',
  },
  {
    id: 'AvatarBox',
    name: 'AvatarBox',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Gradient avatar with a colour picker.',
  },
  {
    id: 'SeedGrid',
    name: 'SeedGrid',
    group: 'auth-onboarding',
    category: 'ui',
    description: '12-word seed grid with blur toggle and copy.',
  },
  {
    id: 'DisplayNameInput',
    name: 'DisplayNameInput',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Display-name field for onboarding.',
  },
  {
    id: 'StorageOptionCard',
    name: 'StorageOptionCard',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Storage target card with a badge and selected ring.',
  },
  {
    id: 'ABPartitionLayout',
    name: 'ABPartitionLayout',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'A/B partition layout with active / standby cards.',
  },
  {
    id: 'SecureBootToggle',
    name: 'SecureBootToggle',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Secure boot switch with a TPM2 sealed badge.',
  },
  {
    id: 'ProviderCard',
    name: 'ProviderCard',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Inference provider card with meta badge and DEFAULT tag.',
  },
  {
    id: 'ConnectionTestButton',
    name: 'ConnectionTestButton',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Connection test button with idle / testing / ok / fail states.',
  },
  {
    id: 'ExtensionCard',
    name: 'ExtensionCard',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Extension picker card with version and sandboxed tag.',
  },
  {
    id: 'RuntimeNotice',
    name: 'RuntimeNotice',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Single-authority runtime notice.',
  },
  {
    id: 'StepProgress',
    name: 'StepProgress',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Onboarding step progress bar with dots.',
  },
  {
    id: 'OnboardingShell',
    name: 'OnboardingShell',
    group: 'auth-onboarding',
    category: 'ui',
    description: 'Onboarding card shell with a step header and footer.',
  },

  // ── Data display (2) ──
  {
    id: 'CodeBlock',
    name: 'CodeBlock',
    group: 'data-display',
    category: 'code',
    description: 'Copyable code block with a mono body.',
  },
  {
    id: 'PropTable',
    name: 'PropTable',
    group: 'data-display',
    category: 'docs',
    description: 'Reference table of component props.',
  },

  // ── Terminal drawer (6) ──
  {
    id: 'TerminalDrawer',
    name: 'TerminalDrawer',
    group: 'terminal-drawer',
    category: 'ui',
    description: 'Bottom drawer shell with a drag handle, snap heights, and session controls.',
  },
  {
    id: 'TerminalTabs',
    name: 'TerminalTabs',
    group: 'terminal-drawer',
    category: 'ui',
    description: 'Session tabs with status dots, hover-reveal close, and a new-tab action.',
  },
  {
    id: 'TerminalPane',
    name: 'TerminalPane',
    group: 'terminal-drawer',
    category: 'ui',
    description: 'Prompt line, collapsible history, autocomplete input, and a cwd/exit/git status bar.',
  },
  {
    id: 'SplitView',
    name: 'SplitView',
    group: 'terminal-drawer',
    category: 'ui',
    description: 'Resizable two-pane split with a hover-glow divider and clamped ratio.',
  },
  {
    id: 'TerminalSuggest',
    name: 'TerminalSuggest',
    group: 'terminal-drawer',
    category: 'ui',
    description: 'Command autocomplete dropdown with icons, descriptions, and keyboard hints.',
  },
  {
    id: 'CollapsedBar',
    name: 'CollapsedBar',
    group: 'terminal-drawer',
    category: 'ui',
    description: 'Minimal 36px collapsed bar with session count and last-command status.',
  },

  // ── Workspace chrome (6) ──
  {
    id: 'Drawer',
    name: 'Drawer',
    group: 'workspace-chrome',
    category: 'ui',
    description: 'Resizable slide-over panel: size presets, drag resize, portal, persistence.',
  },
  {
    id: 'DrawerMenu',
    name: 'DrawerMenu',
    group: 'workspace-chrome',
    category: 'ui',
    description: 'Compact header ⋮ menu with keyboard navigation and checked items.',
  },
  {
    id: 'Modal',
    name: 'Modal',
    group: 'workspace-chrome',
    category: 'ui',
    description: 'Focus-trapped modal shell with accent bar, Escape and backdrop close.',
  },
  {
    id: 'OperationalPanel',
    name: 'OperationalPanel',
    group: 'workspace-chrome',
    category: 'ui',
    description: 'Icon/title/description/actions card with accent or info tone.',
  },
  {
    id: 'StatCard',
    name: 'StatCard',
    group: 'workspace-chrome',
    category: 'ui',
    description: 'Label/value/sub metric card with an accent edge.',
  },
  {
    id: 'ProgressBar',
    name: 'ProgressBar',
    group: 'workspace-chrome',
    category: 'ui',
    description: 'Thin progress bar with status-tone fill by completion band.',
  },
];

/** Count of catalogued components (source of truth for the gallery). */
export const UI_COMPONENT_COUNT = UI_COMPONENT_CATALOG.length;

/** Catalog filtered to a single group. */
export function componentsInGroup(group: UiComponentGroup): readonly UiComponentEntry[] {
  return UI_COMPONENT_CATALOG.filter((entry) => entry.group === group);
}
