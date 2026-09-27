/** @vitest-environment jsdom */

/**
 * AR-DATE-002-03 — date filter dropdown component.
 *
 * Covers trigger/panel presentation only (the stream owns the window):
 * - closed by default, opens on trigger click;
 * - preset click reports computed dates;
 * - manual date edits report custom windows;
 * - invalid windows surface the paused warning;
 * - Escape closes the panel.
 */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ActivityDateFilter, { type DateFilterValue } from './ActivityDateFilter';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);

const BASE = {
  startDate: '',
  endDate: '',
  preset: 'all' as const,
  dateActive: false,
  dateRangeValid: true,
};

function renderFilter(overrides: Partial<typeof BASE> = {}, handlers: { onChange?: (next: DateFilterValue) => void; onClear?: () => void } = {}) {
  const onChange = handlers.onChange ?? vi.fn();
  const onClear = handlers.onClear ?? vi.fn();
  render(<ActivityDateFilter {...BASE} {...overrides} onChange={onChange} onClear={onClear} />);
  return { onChange, onClear };
}

describe('AR-DATE-002 date filter dropdown', () => {
  it('stays closed until the icon trigger opens it', () => {
    renderFilter();
    expect(screen.queryByRole('dialog', { name: 'Filter activity by date' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by date' }));
    expect(screen.getByRole('dialog', { name: 'Filter activity by date' })).toBeTruthy();
  });

  it('reports computed dates when a preset is picked', () => {
    const onChange = vi.fn();
    renderFilter({}, { onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Filter by date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DateFilterValue;
    expect(next.preset).toBe('today');
    expect(next.startDate).toBe(next.endDate);
    expect(next.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reports custom windows on manual date edits', () => {
    function Harness() {
      const [value, setValue] = useState({ startDate: '', endDate: '', preset: 'all' as const });
      return (
        <ActivityDateFilter
          {...value}
          dateActive={value.startDate !== '' || value.endDate !== ''}
          dateRangeValid
          onChange={setValue}
          onClear={() => setValue({ startDate: '', endDate: '', preset: 'all' })}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by date' }));
    fireEvent.change(screen.getByLabelText('Filter from date'), { target: { value: '2026-09-26' } });
    fireEvent.change(screen.getByLabelText('Filter to date'), { target: { value: '2026-09-27' } });
    expect((screen.getByLabelText('Filter from date') as HTMLInputElement).value).toBe('2026-09-26');
    expect((screen.getByLabelText('Filter to date') as HTMLInputElement).value).toBe('2026-09-27');
  });

  it('warns while the window is invalid and clears on request', () => {
    const onClear = vi.fn();
    renderFilter(
      { startDate: '2026-09-27', endDate: '2026-09-26', preset: 'custom', dateActive: true, dateRangeValid: false },
      { onClear },
    );
    fireEvent.click(screen.getByRole('button', { name: /Filter by date/ }));
    expect(screen.getByRole('status').textContent).toMatch(/paused until fixed/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear date filter' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderFilter();
    const trigger = screen.getByRole('button', { name: 'Filter by date' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Filter activity by date' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Filter activity by date' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
