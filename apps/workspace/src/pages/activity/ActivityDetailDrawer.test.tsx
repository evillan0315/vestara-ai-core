/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityProjectionRecord } from './activity-types';
import ActivityDetailDrawer from './ActivityDetailDrawer';

function toolResult(overrides: Partial<ActivityProjectionRecord> = {}): ActivityProjectionRecord {
  return {
    id: 'activity-1',
    sequence: 1,
    timestamp: '2026-09-27T00:00:00.000Z',
    actor: { type: 'agent', id: 'agent-1', displayName: 'Verifier', role: 'verifier' },
    evidenceRefs: [],
    kind: 'tool-result',
    agentId: 'agent-1',
    toolName: 'read',
    callID: 'call-1',
    status: 'completed',
    output: '{"ok":true}',
    ...overrides,
  } as ActivityProjectionRecord;
}

describe('ActivityDetailDrawer operational presentation', () => {
  it('leads with operational information and keeps raw data secondary', () => {
    render(<ActivityDetailDrawer record={toolResult()} onClose={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Activity details' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Raw data' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Raw data' }));
    expect(screen.getByRole('region', { name: 'Raw data' }).querySelector('pre')).toHaveTextContent('ok');
  });

  it('preserves exact operation identity without creating a lineage graph', () => {
    render(<ActivityDetailDrawer record={toolResult()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));
    expect(screen.getByText('call-1')).toBeInTheDocument();
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /lineage/i })).toBeNull();
  });

  it('omits unsupported tabs when optional evidence and operation data are absent', () => {
    const record = {
      ...toolResult(),
      kind: 'agent-message',
      content: 'A human-readable activity',
      toolName: undefined,
      output: undefined,
    } as unknown as ActivityProjectionRecord;

    render(<ActivityDetailDrawer record={record} onClose={vi.fn()} />);

    expect(screen.queryByRole('tab', { name: 'Operations' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Evidence' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Raw data' })).toBeInTheDocument();
  });

  it('uses the same contained scroll composition for long and short activity content', () => {
    const { rerender } = render(
      <ActivityDetailDrawer
        record={toolResult({ output: 'long activity content '.repeat(500) })}
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelector('.activity-detail-drawer-body')).toHaveClass('activity-detail-drawer-body');
    expect(document.querySelector('.activity-detail-tab-content')).toHaveClass('activity-detail-tab-content');
    expect(document.querySelector('.activity-detail-content-panel')).toHaveClass('st-card-fixed');

    rerender(<ActivityDetailDrawer record={toolResult({ output: '$ git status' })} onClose={vi.fn()} />);

    expect(document.querySelector('.activity-detail-drawer-body')).toHaveClass('activity-detail-drawer-body');
    expect(document.querySelector('.activity-detail-tab-content')).toHaveClass('activity-detail-tab-content');
    expect(document.querySelector('.activity-detail-content-panel')).toHaveClass('st-card-fixed');
  });
});
