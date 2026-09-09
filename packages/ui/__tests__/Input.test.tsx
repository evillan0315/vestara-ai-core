/**
 * @vestara/ui: Input Component Tests
 *
 * Comprehensive tests for the Input component.
 *
 * @see packages/ui/src/components/Input.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../src/components/Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Username" />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('renders with hint', () => {
    render(<Input hint="Must be at least 8 characters" />);
    expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument();
  });

  it('renders with error', () => {
    render(<Input error="Field is required" />);
    expect(screen.getByText('Field is required')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not show hint when error is present', () => {
    render(<Input hint="Help text" error="Error text" />);
    expect(screen.queryByText('Help text')).not.toBeInTheDocument();
    expect(screen.getByText('Error text')).toBeInTheDocument();
  });

  it('calls onChange when value changes', () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders with sm size', () => {
    render(<Input size="sm" />);
    expect(screen.getByRole('textbox').className).toContain('h-7');
  });

  it('renders with md size', () => {
    render(<Input size="md" />);
    expect(screen.getByRole('textbox').className).toContain('h-9');
  });

  it('renders with lg size', () => {
    render(<Input size="lg" />);
    expect(screen.getByRole('textbox').className).toContain('h-11');
  });

  it('renders full width when fullWidth', () => {
    render(<Input fullWidth />);
    expect(screen.getByRole('textbox').parentElement?.parentElement?.className).toContain('w-full');
  });

  it('forwards ref', () => {
    const ref = { current: null };
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('generates id from label', () => {
    render(<Input label="Email Address" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'input-email-address');
  });

  it('links error to input via aria-describedby', () => {
    render(<Input label="Name" error="Required" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'input-name-error');
  });

  it('links hint to input via aria-describedby', () => {
    render(<Input label="Name" hint="Help text" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'input-name-hint');
  });
});
