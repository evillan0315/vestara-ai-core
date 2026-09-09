/**
 * VES-UI-B5: Avatar Component
 *
 * Domain-independent avatar component for user/agent representation.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'square';

export interface AvatarProps {
  /** Avatar size */
  size?: AvatarSize;

  /** Avatar shape */
  shape?: AvatarShape;

  /** Image source */
  src?: string;

  /** Alt text */
  alt?: string;

  /** Fallback initials */
  initials?: string;

  /** Fallback icon */
  icon?: ReactNode;

  /** Background color for fallback */
  color?: string;

  /** Custom class name */
  className?: string;
}

// ─── Styles ────────────────────────────────────────────────────

const SIZE_STYLES: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
  xl: { container: 'w-16 h-16', text: 'text-lg' },
};

const SHAPE_STYLES: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-lg',
};

// ─── Component ─────────────────────────────────────────────────

export function Avatar({
  size = 'md',
  shape = 'circle',
  src,
  alt = '',
  initials,
  icon,
  color = 'var(--vestara-accent-primary)',
  className = '',
}: AvatarProps) {
  const sizeStyle = SIZE_STYLES[size];
  const shapeStyle = SHAPE_STYLES[shape];

  // If image is provided, show image
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`
          ${sizeStyle.container} ${shapeStyle}
          object-cover
          ${className}
        `}
      />
    );
  }

  // Show initials or icon as fallback
  return (
    <div
      className={`
        ${sizeStyle.container} ${shapeStyle}
        flex items-center justify-center
        font-medium text-white
        ${className}
      `}
      style={{ backgroundColor: color }}
      aria-label={alt || initials || undefined}
    >
      {icon ? (
        <span className="shrink-0">{icon}</span>
      ) : initials ? (
        <span className={sizeStyle.text}>{initials}</span>
      ) : (
        <span className={sizeStyle.text}>?</span>
      )}
    </div>
  );
}
