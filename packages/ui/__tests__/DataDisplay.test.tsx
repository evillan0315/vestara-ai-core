/**
 * @vestara/ui: Data Display Component Tests
 *
 * Comprehensive tests for Table, List, Tag, and Chip components.
 *
 * @see packages/ui/src/components/Table.tsx
 * @see packages/ui/src/components/List.tsx
 * @see packages/ui/src/components/Tag.tsx
 * @see packages/ui/src/components/Chip.tsx
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from '../src/components/Chip';
import { List, ListDivider, ListHeader, ListItem, ListItemText } from '../src/components/List';
import { Table } from '../src/components/Table';
import { Tag } from '../src/components/Tag';

// ─── Table Tests ───────────────────────────────────────────────

describe('Table', () => {
  const columns = [
    { id: 'name', label: 'Name', key: 'name' as const },
    { id: 'role', label: 'Role', key: 'role' as const },
  ];

  const data = [
    { name: 'Alice', role: 'Developer' },
    { name: 'Bob', role: 'Designer' },
  ];

  it('renders table with columns', () => {
    render(<Table columns={columns} data={data} keyExtractor={(r) => r.name} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  it('renders table rows', () => {
    render(<Table columns={columns} data={data} keyExtractor={(r) => r.name} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<Table columns={columns} data={[]} keyExtractor={(r) => r.name} emptyContent="No data found" />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<Table columns={columns} data={data} keyExtractor={(r) => r.name} loading />);
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5 skeleton rows
  });

  it('calls onRowClick when row is clicked', () => {
    const handleClick = vi.fn();
    render(<Table columns={columns} data={data} keyExtractor={(r) => r.name} onRowClick={handleClick} />);
    fireEvent.click(screen.getByText('Alice'));
    expect(handleClick).toHaveBeenCalledWith(data[0]);
  });

  it('renders selection checkboxes when selectable', () => {
    render(<Table columns={columns} data={data} keyExtractor={(r) => r.name} selectable />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3); // header + 2 rows
  });
});

// ─── List Tests ────────────────────────────────────────────────

describe('List', () => {
  it('renders list items', () => {
    render(
      <List>
        <ListItem>Item 1</ListItem>
        <ListItem>Item 2</ListItem>
      </List>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders with dividers', () => {
    render(
      <List dividers>
        <ListItem>Item 1</ListItem>
        <ListDivider />
        <ListItem>Item 2</ListItem>
      </List>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders with border', () => {
    render(
      <List bordered>
        <ListItem>Item</ListItem>
      </List>,
    );
    const list = screen.getByRole('list');
    expect(list.className).toContain('rounded-xl border');
  });
});

describe('ListItem', () => {
  it('renders with children', () => {
    render(<ListItem>Item content</ListItem>);
    expect(screen.getByText('Item content')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<ListItem onClick={handleClick}>Clickable</ListItem>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders as button when onClick provided', () => {
    render(<ListItem onClick={() => {}}>Clickable</ListItem>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(
      <ListItem disabled onClick={handleClick}>
        Disabled
      </ListItem>,
    );
    fireEvent.click(screen.getByText('Disabled'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders selected state', () => {
    render(<ListItem selected>Selected</ListItem>);
    const item = screen.getByText('Selected').closest('li');
    expect(item?.className).toContain('bg-[var(--vestara-accent-primary)]/10');
  });
});

describe('ListItemText', () => {
  it('renders primary text', () => {
    render(<ListItemText primary="Primary Text" />);
    expect(screen.getByText('Primary Text')).toBeInTheDocument();
  });

  it('renders secondary text', () => {
    render(<ListItemText primary="Primary" secondary="Secondary" />);
    expect(screen.getByText('Secondary')).toBeInTheDocument();
  });
});

describe('ListHeader', () => {
  it('renders header text', () => {
    render(<ListHeader>Section Header</ListHeader>);
    expect(screen.getByText('Section Header')).toBeInTheDocument();
  });
});

// ─── Tag Tests ─────────────────────────────────────────────────

describe('Tag', () => {
  it('renders with children', () => {
    render(<Tag>Tag Label</Tag>);
    expect(screen.getByText('Tag Label')).toBeInTheDocument();
  });

  it('renders with default variant', () => {
    render(<Tag>Test</Tag>);
    const tag = screen.getByText('Test').closest('span');
    expect(tag?.className).toContain('bg-[var(--vestara-surface-panel-raised)]');
  });

  it('renders with success variant', () => {
    render(<Tag variant="success">Success</Tag>);
    const tag = screen.getByText('Success').closest('span');
    expect(tag?.className).toContain('bg-[var(--vestara-status-success)]');
  });

  it('renders removable tag', () => {
    const handleRemove = vi.fn();
    render(
      <Tag removable onRemove={handleRemove}>
        Removable
      </Tag>,
    );
    const removeButton = screen.getByLabelText('Remove');
    expect(removeButton).toBeInTheDocument();
    fireEvent.click(removeButton);
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Tag onClick={handleClick}>Clickable</Tag>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

// ─── Chip Tests ────────────────────────────────────────────────

describe('Chip', () => {
  it('renders with children', () => {
    render(<Chip>Chip Label</Chip>);
    expect(screen.getByText('Chip Label')).toBeInTheDocument();
  });

  it('renders as button', () => {
    render(<Chip>Test</Chip>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Chip onClick={handleClick}>Clickable</Chip>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders selected state', () => {
    render(<Chip selected>Selected</Chip>);
    const chip = screen.getByRole('button');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders disabled state', () => {
    render(<Chip disabled>Disabled</Chip>);
    const chip = screen.getByRole('button');
    expect(chip).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(
      <Chip disabled onClick={handleClick}>
        Disabled
      </Chip>,
    );
    fireEvent.click(screen.getByText('Disabled'));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
