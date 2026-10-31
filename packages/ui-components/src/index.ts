/**
 * @vestara/ui-components — Vestara OS component library.
 *
 * Extracted from the VESTARA AI_OS / EXTRACTOR reference artifact and
 * normalised onto the canonical Vestara design tokens (VES-DESIGN-006 in
 * @vestara/ui-tokens). Every visual value resolves through
 * `var(--vestara-*)` — no raw hex, no arbitrary utilities.
 *
 * Layering: @vestara/ui-tokens (tokens) → @vestara/ui-components
 * (primitives) → @vestara/marketplace-ui (gallery) → apps (pages/routes).
 */

// ─── Catalog ───────────────────────────────────────────────────

export type { UiComponentEntry, UiComponentGroup } from './catalog.js';
export { componentsInGroup, UI_COMPONENT_CATALOG, UI_COMPONENT_COUNT, UI_COMPONENT_GROUPS } from './catalog.js';

// ─── Icons (vendored) ──────────────────────────────────────────

export type { IconName, IconProps } from './icons.js';
export * as icons from './icons.js';

// ─── File workspace ────────────────────────────────────────────

export type {
  ActionGridProps,
  BreadcrumbProps,
  CodeViewerProps,
  CommandPaletteProps,
  DetailCardProps,
  FileCategory,
  FileIconProps,
  FileIndexEntry,
  FileNode,
  FilterChipsProps,
  GitStatusCardProps,
  SearchInputProps,
  TabBarProps,
  TabEntry,
  ToastProps,
  TreeNodeProps,
} from './file-workspace.js';
export {
  ActionGrid,
  Breadcrumb,
  CodeViewer,
  CommandPalette,
  DetailCard,
  FileIcon,
  FilterChips,
  GitStatusCard,
  SearchInput,
  TabBar,
  Toast,
  TreeNode,
} from './file-workspace.js';

// ─── Chat assistant ────────────────────────────────────────────

export type {
  AppHeaderProps,
  ArchitectureCardProps,
  ArchitectureLayer,
  ChatMessageData,
  ChatMessageProps,
  ComposerProps,
  Conversation,
  ConversationGroupProps,
  ConversationItemProps,
  GapCardProps,
  ModelSelectorProps,
  NewChatButtonProps,
  OsUnit,
  OsUnitsCardProps,
  SidebarProps,
  TestRow,
  TestSuiteCardProps,
  TypingIndicatorProps,
  WorkspaceTabItem,
  WorkspaceTabsProps,
} from './chat-assistant.js';
export {
  AppHeader,
  ArchitectureCard,
  ChatMessage,
  Composer,
  ConversationGroup,
  ConversationItem,
  GapCard,
  ModelSelector,
  NewChatButton,
  OsUnitsCard,
  Sidebar,
  TestSuiteCard,
  TypingIndicator,
  WorkspaceTabs,
} from './chat-assistant.js';

// ─── Auth & onboarding ─────────────────────────────────────────

export type {
  ABPartitionLayoutProps,
  AuthMethod,
  AvatarBoxProps,
  ConnectionStatus,
  ConnectionTestButtonProps,
  DisplayNameInputProps,
  ExtensionCardProps,
  HardwareKeyCardProps,
  HardwareStatus,
  IconRenderer,
  MethodTabsProps,
  OnboardingShellProps,
  PartitionCardProps,
  PassphraseInputProps,
  ProviderCardProps,
  RecoveryGridProps,
  RuntimeNoticeProps,
  SecureBootToggleProps,
  SeedGridProps,
  StepProgressProps,
  StorageOptionCardProps,
  TracerBadgeProps,
} from './auth-onboarding.js';
export {
  ABPartitionLayout,
  AvatarBox,
  ConnectionTestButton,
  DisplayNameInput,
  ExtensionCard,
  HardwareKeyCard,
  MethodTabs,
  OnboardingShell,
  PartitionCard,
  PassphraseInput,
  ProviderCard,
  RecoveryGrid,
  RuntimeNotice,
  SecureBootToggle,
  SeedGrid,
  StepProgress,
  StorageIcons,
  StorageOptionCard,
  TracerBadge,
} from './auth-onboarding.js';

// ─── Data display ──────────────────────────────────────────────

export type { CodeBlockProps, PropRow, PropTableProps } from './data-display.js';
export { CodeBlock, PropTable } from './data-display.js';

// ─── Workspace chrome (drawers, modal, cards) ────────────────────

export type {
  DrawerMenuAction,
  DrawerMenuProps,
  DrawerPosition,
  DrawerProps,
  DrawerSize,
  ModalProps,
  OperationalPanelProps,
  OperationalPanelTone,
  ProgressBarProps,
  ProgressBarSize,
  SectionCardProps,
  StatCardProps,
} from './workspace-chrome.js';
export { Drawer, DrawerMenu, Modal, OperationalPanel, ProgressBar, SectionCard, StatCard } from './workspace-chrome.js';

// ─── Calendar / appointments ─────────────────────────────────────

export type {
  CalendarAppointment,
  CalendarAppointmentType,
  CalendarView,
} from './calendar.fixtures.js';
export {
  CALENDAR_APPOINTMENT_TYPES,
  CALENDAR_APPOINTMENTS,
  CALENDAR_MONTH_DAYS,
  CALENDAR_VIEWS,
  CALENDAR_WEEKDAYS,
} from './calendar.fixtures.js';
export type {
  AppointmentComposerProps,
  AppointmentDetailsCardProps,
  AppointmentListViewProps,
  AppointmentRowProps,
  AppointmentTypeListProps,
  CalendarMiniProps,
  CalendarMonthGridProps,
  CalendarShellProps,
  CalendarToolbarProps,
  WorkingHoursCardProps,
} from './calendar.js';
export {
  AppointmentComposer,
  AppointmentDetailsCard,
  AppointmentListView,
  AppointmentRow,
  AppointmentSettingsPanel,
  AppointmentTypeList,
  CalendarMini,
  CalendarMonthGrid,
  CalendarShell,
  CalendarToolbar,
  WorkingHoursCard,
} from './calendar.js';

// ─── Terminal drawer ───────────────────────────────────────────

export type {
  CollapsedBarProps,
  SplitViewProps,
  SuggestCommand,
  TerminalDrawerProps,
  TerminalHistoryEntry,
  TerminalPaneProps,
  TerminalSession,
  TerminalSessionStatus,
  TerminalStatus,
  TerminalSuggestProps,
  TerminalTabsProps,
} from './terminal.js';
export {
  CollapsedBar,
  SplitView,
  TerminalDrawer,
  TerminalPane,
  TerminalSuggest,
  TerminalTabs,
} from './terminal.js';
