/**
 * @vestara/ui: Badge, Avatar, Card Component Tests
 *
 * Comprehensive tests for display and container components.
 *
 * @see packages/ui/src/components/Badge.tsx
 * @see packages/ui/src/components/Avatar.tsx
 * @see packages/ui/src/components/Card.tsx
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar } from '../src/components/Avatar';
import { Badge } from '../src/components/Badge';
import { Card, CardActions, CardContent, CardHeader } from '../src/components/Card';

// ─── Badge Tests ───────────────────────────────────────────────

describe('Badge', () => {
  it('renders with children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders with default variant', () => {
    render(<Badge>Test</Badge>);
    const badge = screen.getByText('Test').closest('span');
    expect(badge?.className).toContain('bg-[var(--vestara-surface-panel-raised)]');
  });

  it('renders with success variant', () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText('Success').closest('span');
    expect(badge?.className).toContain('bg-[var(--vestara-status-success)]');
  });

  it('renders with error variant', () => {
    render(<Badge variant="error">Error</Badge>);
    const badge = screen.getByText('Error').closest('span');
    expect(badge?.className).toContain('bg-[var(--vestara-status-error)]');
  });

  it('renders dot indicator', () => {
    render(<Badge dot>With Dot</Badge>);
    const badge = screen.getByText('With Dot').closest('span');
    const dot = badge?.querySelector('.rounded-full');
    expect(dot).toBeInTheDocument();
  });

  it('renders with sm size', () => {
    render(<Badge size="sm">Small</Badge>);
    const badge = screen.getByText('Small').closest('span');
    expect(badge?.className).toContain('px-1.5');
  });

  it('renders with lg size', () => {
    render(<Badge size="lg">Large</Badge>);
    const badge = screen.getByText('Large').closest('span');
    expect(badge?.className).toContain('px-2.5');
  });
});

// ─── Avatar Tests ──────────────────────────────────────────────

describe('Avatar', () => {
  it('renders with initials', () => {
    render(<Avatar initials="JD" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders with image', () => {
    render(<Avatar src="/avatar.jpg" alt="John Doe" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'John Doe');
  });

  it('falls back to initials when image fails', () => {
    render(<Avatar initials="AB" />);
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('renders with sm size', () => {
    render(<Avatar initials="S" size="sm" />);
    const avatar = screen.getByText('S').closest('div');
    expect(avatar?.className).toContain('w-8 h-8');
  });

  it('renders with lg size', () => {
    render(<Avatar initials="L" size="lg" />);
    const avatar = screen.getByText('L').closest('div');
    expect(avatar?.className).toContain('w-12 h-12');
  });

  it('renders with circle shape', () => {
    render(<Avatar initials="C" shape="circle" />);
    const avatar = screen.getByText('C').closest('div');
    expect(avatar?.className).toContain('rounded-full');
  });

  it('renders with square shape', () => {
    render(<Avatar initials="S" shape="square" />);
    const avatar = screen.getByText('S').closest('div');
    expect(avatar?.className).toContain('rounded-lg');
  });
});

// ─── Card Tests ────────────────────────────────────────────────

describe('Card', () => {
  it('renders with children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders as div by default', () => {
    render(<Card>Test</Card>);
    const card = screen.getByText('Test').closest('div');
    expect(card).toBeInTheDocument();
  });

  it('renders as button when onClick provided', () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Clickable</Card>);
    const card = screen.getByRole('button');
    expect(card).toBeInTheDocument();
    fireEvent.click(card);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders with default variant', () => {
    render(<Card>Test</Card>);
    const card = screen.getByText('Test').closest('div');
    expect(card?.className).toContain('border border-[var(--vestara-border-subtle)]');
  });

  it('renders with selected variant', () => {
    render(<Card variant="selected">Test</Card>);
    const card = screen.getByText('Test').closest('div');
    expect(card?.className).toContain('border-2 border-[var(--vestara-accent-primary)]');
  });
});

describe('CardHeader', () => {
  it('renders title', () => {
    render(<CardHeader title="Header Title" />);
    expect(screen.getByText('Header Title')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<CardHeader title="Title" subtitle="Subtitle text" />);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('renders action', () => {
    render(<CardHeader title="Title" action={<button type="button">Edit</button>} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});

describe('CardContent', () => {
  it('renders content', () => {
    render(<CardContent>Content text</CardContent>);
    expect(screen.getByText('Content text')).toBeInTheDocument();
  });
});

describe('CardActions', () => {
  it('renders actions', () => {
    render(
      <CardActions>
        <button type="button">Cancel</button>
        <button type="button">Save</button>
      </CardActions>,
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });
});
