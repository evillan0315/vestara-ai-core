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

export type { ActionIconProps, ActionIconSize, ActionIconTone } from './components/ActionIcon.js';
export { ACTION_ICON_SIZES, ACTION_ICON_TONES, ActionIcon } from './components/ActionIcon.js';
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

// ─── Navigation ────────────────────────────────────────────────

export type { Tab, TabsProps } from './components/Tabs.js';
export { Tabs } from './components/Tabs.js';

// ─── Disclosure ────────────────────────────────────────────────

export type { AccordionItemProps, AccordionProps } from './components/Accordion.js';
export { Accordion, AccordionItem } from './components/Accordion.js';
export type { CollapsibleProps } from './components/Collapsible.js';
export { Collapsible } from './components/Collapsible.js';
export type { KeyValueItem, KeyValueListProps } from './components/KeyValueList.js';
export { KeyValueList } from './components/KeyValueList.js';
export type { MetricCardProps, MetricTone } from './components/MetricCard.js';
export { MetricCard } from './components/MetricCard.js';
export type { ProgressIndicatorProps, ProgressTone } from './components/ProgressIndicator.js';
export { ProgressIndicator } from './components/ProgressIndicator.js';
export type { StepDefinition, StepperProps, StepState } from './components/Stepper.js';
export { Stepper } from './components/Stepper.js';
export type { TimelineItemDefinition, TimelineItemProps, TimelineProps, TimelineTone } from './components/Timeline.js';
export { Timeline, TimelineItem } from './components/Timeline.js';

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

// ─── Page Hero ──────────────────────────────────────────────────

export type {
  PageHeroAction,
  PageHeroDensity,
  PageHeroProps,
  PageHeroRegistry,
  PageHeroSearch,
  PageHeroStat,
  PageHeroStatusTone,
  RouteHeroProps,
} from './components/PageHero.js';
export { mergeHeroDefaults, PageHero, pageHeroStatusDotClass, RouteHero } from './components/PageHero.js';

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
