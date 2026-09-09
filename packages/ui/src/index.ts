/**
 * @vestara/ui — Domain-Independent Presentation Components
 *
 * Core UI primitives for the Vestara UI Platform.
 * All components are domain-independent — no agent, workflow, or execution imports.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
 *   VES-UI-C: Data Display (phases 6-8)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Actions ───────────────────────────────────────────────────

export { Button } from './components/Button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button.js';

// ─── Forms ─────────────────────────────────────────────────────

export { Input } from './components/Input.js';
export type { InputProps, InputSize } from './components/Input.js';

// ─── Display ───────────────────────────────────────────────────

export { Badge } from './components/Badge.js';
export type { BadgeProps, BadgeVariant, BadgeSize } from './components/Badge.js';

export { Avatar } from './components/Avatar.js';
export type { AvatarProps, AvatarSize, AvatarShape } from './components/Avatar.js';

// ─── Data Display ──────────────────────────────────────────────

export { Table } from './components/Table.js';
export type { TableProps, TableColumn, SortDirection } from './components/Table.js';

export {
  List,
  ListItem,
  ListItemText,
  ListItemAction,
  ListDivider,
  ListHeader,
} from './components/List.js';
export type {
  ListProps,
  ListItemProps,
  ListItemTextProps,
  ListItemActionProps,
  ListDividerProps,
  ListHeaderProps,
  ListSize,
} from './components/List.js';

export { Tag } from './components/Tag.js';
export type { TagProps, TagVariant, TagSize } from './components/Tag.js';

export { Chip } from './components/Chip.js';
export type { ChipProps, ChipVariant, ChipSize } from './components/Chip.js';

// ─── Containers ────────────────────────────────────────────────

export { Card, CardHeader, CardContent, CardActions } from './components/Card.js';
export type {
  CardProps,
  CardHeaderProps,
  CardContentProps,
  CardActionsProps,
  CardVariant,
  CardPadding,
} from './components/Card.js';

// ─── Layout Shell ──────────────────────────────────────────────

export {
  Shell,
  ShellHeader,
  ShellNavigation,
  ShellContent,
  ShellInspector,
  ShellBottomPanel,
  useShell,
} from './components/Shell.js';
export type {
  ShellProps,
  ShellHeaderProps,
  ShellNavigationProps,
  ShellContentProps,
  ShellInspectorProps,
  ShellBottomPanelProps,
  ShellContextValue,
  ShellBreakpoint,
} from './components/Shell.js';

// ─── Panes ─────────────────────────────────────────────────────

export {
  SplitPane,
  MasterDetailLayout,
  ThreePaneLayout,
  Page,
  PageHeader,
  PageTitle,
  PageActions,
} from './components/Panes.js';
export type {
  SplitPaneProps,
  SplitDirection,
  MasterDetailLayoutProps,
  ThreePaneLayoutProps,
  PageProps,
  PageHeaderProps,
  PageTitleProps,
  PageActionsProps,
} from './components/Panes.js';

// ─── Responsive ────────────────────────────────────────────────

export {
  useResponsiveLayout,
  useBreakpoint,
  useMediaQuery,
  matchesBreakpoint,
  responsive,
  mediaQuery,
  responsiveClasses,
} from './components/Responsive.js';
export type {
  ResponsiveBreakpoint,
  ResponsiveState,
  UseResponsiveLayoutOptions,
} from './components/Responsive.js';
