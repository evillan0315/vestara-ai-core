/**
 * Shared agent UI primitives.
 *
 * These components are consumed by both Agent Control and Activity Room.
 * They do not depend on either page's state.
 *
 * Authority: GET /api/agents is the single source of truth for agent data.
 * These types and components do NOT define agent identity — the backend does.
 *
 * Usage:
 *   import { AgentCard, AgentEditor, ProviderModelPicker } from '../../components/ui/agents';
 */

// Types
export type { AgentIdentity, AgentStats, AgentSaveData, TeamRef } from './types';

// Derive category + presentation constants
export { deriveCategory, CATEGORY_ORDER, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_DESCRIPTIONS } from './deriveCategory';

// Agent color resolution
export { getAgentColor } from './agentColors';

// Shared form CSS classes
export { inputClass, labelClass, errorClass, selectClass, buttonPrimaryClass, buttonSecondaryClass } from './formClasses';

// Components
export { AgentStatusBadge } from './AgentStatusBadge';
export type { AgentStatusBadgeProps } from './AgentStatusBadge';
export { AgentSummary } from './AgentSummary';
export type { AgentSummaryProps } from './AgentSummary';
export { AgentCard } from './AgentCard';
export type { AgentCardProps } from './AgentCard';
export { AgentEditor } from './AgentEditor';
export type { AgentEditorProps } from './AgentEditor';
export { ProviderModelPicker } from './ProviderModelPicker';
export type { ProviderModelPickerProps } from './ProviderModelPicker';
export { AgentCategoryList } from './AgentCategoryList';
export type { AgentCategoryListProps } from './AgentCategoryList';
