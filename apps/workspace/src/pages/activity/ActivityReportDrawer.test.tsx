/** @vitest-environment jsdom */

/**
 * AR-REPORT — report drawer over the reusable Drawer shell.
 *
 * fetch is mocked; records come from activity-report.fixtures.ts (never
 * hardcoded in JSX). Covers: closed fetches nothing, open loads the range,
 * custom ranges refetch, invalid ranges pause, errors retry, empty states,
 * details expansion, and close.
 */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_FIXTURES } from './activity-report.fixtures';
import { toCalendarDate } from './ActivityDateFilter';
import ActivityReportDrawer from './ActivityReportDrawer';

const fetchMock = vi.fn();

function okResponse(records: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ records, firstSequence: 0, lastSequence: 0 }),
  } as Response;
}

function failResponse(): Response {
  return { ok: false, status: 500, json: () => Promise.resolve({}) } as Response;
}

function reportButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /by Verifier/ });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(okResponse(REPORT_FIXTURES));
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('ActivityReportDrawer', () => {
  it('fetches nothing while closed', () => {
    render(<ActivityReportDrawer open={false} onClose={vi.fn()} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Activity report' })).toBeNull();
  });

  it("loads today's window on open and renders summary plus timeline", async () => {
    render(<ActivityReportDrawer open onClose={vi.fn()} />);
    const today = toCalendarDate(new Date());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/activity-room?from=${encodeURIComponent(`${today}T00:00:00.000Z`)}&to=${encodeURIComponent(`${today}T23:59:59.999Z`)}&limit=1000`,
    );
    expect(await screen.findByText('4 activities')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Report summary' });
    expect(summary).toHaveTextContent('Agent');
    expect(summary).toHaveTextContent('Workflow');
    expect(summary).toHaveTextContent('Tool');
    expect(within(summary).getAllByRole('listitem')).toHaveLength(3);
    expect(reportButtons()).toHaveLength(4);
  });

  it('refetches when a custom range is picked', async () => {
    render(<ActivityReportDrawer open onClose={vi.fn()} />);
    await screen.findByText('4 activities');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Filter by date/ }));
    fireEvent.change(screen.getByLabelText('Filter from date'), { target: { value: '2026-10-09' } });
    fireEvent.change(screen.getByLabelText('Filter to date'), { target: { value: '2026-10-10' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const last = fetchMock.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain(`from=${encodeURIComponent('2026-10-09T00:00:00.000Z')}`);
    expect(last).toContain(`to=${encodeURIComponent('2026-10-10T23:59:59.999Z')}`);
  });

  it('pauses loading with a notice when the range is invalid', async () => {
    render(<ActivityReportDrawer open onClose={vi.fn()} />);
    await screen.findByText('4 activities');
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Filter by date/ }));
    const tomorrow = toCalendarDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const today = toCalendarDate(new Date());
    fireEvent.change(screen.getByLabelText('Filter from date'), { target: { value: tomorrow } });
    fireEvent.change(screen.getByLabelText('Filter to date'), { target: { value: today } });
    expect(await screen.findByText(/report paused until fixed/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('shows an error with retry when loading fails', async () => {
    fetchMock.mockResolvedValueOnce(failResponse());
    render(<ActivityReportDrawer open onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load activity (HTTP 500).');
    fetchMock.mockResolvedValueOnce(okResponse(REPORT_FIXTURES));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('4 activities')).toBeInTheDocument();
  });

  it('shows an empty state when the range has no activities', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([]));
    render(<ActivityReportDrawer open onClose={vi.fn()} />);
    expect(await screen.findByText(/No activities in/)).toBeInTheDocument();
  });

  it('expands a row to show record-stamped details', async () => {
    render(<ActivityReportDrawer open onClose={vi.fn()} />);
    await screen.findByText('4 activities');
    fireEvent.click(reportButtons()[0]);
    expect(screen.getByText('report-fixture-11')).toBeInTheDocument();
    expect(screen.getAllByText('deployment started')).toHaveLength(2);
    expect(reportButtons()[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes via the drawer close button', async () => {
    const onClose = vi.fn();
    render(<ActivityReportDrawer open onClose={onClose} />);
    await screen.findByText('4 activities');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
