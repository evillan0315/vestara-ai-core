/**
 * @vestara/ui — Domain-Independent Presentation Components
 *
 * Core UI primitives for the Vestara UI Platform.
 * All components are domain-independent — no agent, workflow, or execution imports.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
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
