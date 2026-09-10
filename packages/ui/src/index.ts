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

export type { ButtonProps, ButtonSize, ButtonVariant } from './components/Button.js';
export { Button } from './components/Button.js';
export type { PillProps, PillSize, PillVariant } from './components/Pill.js';
export { Pill } from './components/Pill.js';

// ─── Forms ─────────────────────────────────────────────────────

export type { InputProps, InputSize } from './components/Input.js';
export { Input } from './components/Input.js';

// ─── Display ───────────────────────────────────────────────────

export type { AvatarProps, AvatarShape, AvatarSize } from './components/Avatar.js';
export { Avatar } from './components/Avatar.js';
export type { BadgeProps, BadgeSize, BadgeVariant } from './components/Badge.js';
export { Badge } from './components/Badge.js';
export type { EmptyStateProps } from './components/EmptyState.js';
export { EmptyState } from './components/EmptyState.js';
export type { StatusIndicatorProps, StatusSize, StatusVariant } from './components/StatusIndicator.js';
export { StatusIndicator } from './components/StatusIndicator.js';

// ─── Data Display ──────────────────────────────────────────────

export type { ChipProps, ChipSize, ChipVariant } from './components/Chip.js';
export { Chip } from './components/Chip.js';
export type {
  ListDividerProps,
  ListHeaderProps,
  ListItemActionProps,
  ListItemProps,
  ListItemTextProps,
  ListProps,
  ListSize,
} from './components/List.js';
export {
  List,
  ListDivider,
  ListHeader,
  ListItem,
  ListItemAction,
  ListItemText,
} from './components/List.js';
export type { SortDirection, TableColumn, TableProps } from './components/Table.js';
export { Table } from './components/Table.js';
export type { TagProps, TagSize, TagVariant } from './components/Tag.js';
export { Tag } from './components/Tag.js';

// ─── Containers ────────────────────────────────────────────────

export type {
  CardActionsProps,
  CardContentProps,
  CardHeaderProps,
  CardPadding,
  CardProps,
  CardVariant,
} from './components/Card.js';
export { Card, CardActions, CardContent, CardHeader } from './components/Card.js';

// ─── Layout Shell ──────────────────────────────────────────────

export type {
  ShellBottomPanelProps,
  ShellBreakpoint,
  ShellContentProps,
  ShellContextValue,
  ShellHeaderProps,
  ShellInspectorProps,
  ShellNavigationProps,
  ShellProps,
} from './components/Shell.js';
export {
  Shell,
  ShellBottomPanel,
  ShellContent,
  ShellHeader,
  ShellInspector,
  ShellNavigation,
  useShell,
} from './components/Shell.js';

// ─── Panes ─────────────────────────────────────────────────────

export type {
  MasterDetailLayoutProps,
  PageActionsProps,
  PageHeaderProps,
  PageProps,
  PageTitleProps,
  SplitDirection,
  SplitPaneProps,
  ThreePaneLayoutProps,
} from './components/Panes.js';
export {
  MasterDetailLayout,
  Page,
  PageActions,
  PageHeader,
  PageTitle,
  SplitPane,
  ThreePaneLayout,
} from './components/Panes.js';

// ─── Floating Window ──────────────────────────────────────────

export type {
  FloatingWindowContentProps,
  FloatingWindowHeaderProps,
  FloatingWindowManagerContextValue,
  FloatingWindowManagerProps,
  FloatingWindowProps,
  WindowState,
} from './components/FloatingWindow.js';
export {
  FloatingWindow,
  FloatingWindowContent,
  FloatingWindowHeader,
  FloatingWindowManager,
  useFloatingWindowManager,
} from './components/FloatingWindow.js';

// ─── Responsive ────────────────────────────────────────────────

export type {
  ResponsiveBreakpoint,
  ResponsiveState,
  UseResponsiveLayoutOptions,
} from './components/Responsive.js';
export {
  matchesBreakpoint,
  mediaQuery,
  responsive,
  responsiveClasses,
  useBreakpoint,
  useMediaQuery,
  useResponsiveLayout,
} from './components/Responsive.js';

// ─── Charts ────────────────────────────────────────────────────

export type { BarChartDataPoint, BarChartProps } from './components/BarChart.js';
export { BarChart } from './components/BarChart.js';
export type { LineChartDataPoint, LineChartProps } from './components/LineChart.js';
export { LineChart } from './components/LineChart.js';
export type { PieChartDataPoint, PieChartProps } from './components/PieChart.js';
export { PieChart } from './components/PieChart.js';
