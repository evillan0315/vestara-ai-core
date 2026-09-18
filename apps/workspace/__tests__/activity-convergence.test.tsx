// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantProjection } from '@vestara/activity-room';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomContextPanel from '../src/pages/activity/ActivityRoomContextPanel.js';
import M11CParticipantRail from '../src/pages/activity/M11CParticipantRail.js';

function participant(overrides?: Partial<ParticipantProjection>): ParticipantProjection {
  return {
    participantId: 'agent-1',
    type: 'agent',
    displayName: 'vestara-developer',
    membership: 'joined',
    presence: 'online',
    workState: 'working',
    joinedAt: '2026-09-16T00:00:00.000Z',
    lastActivityAt: '2026-09-16T01:00:00.000Z',
    ...overrides,
  } as ParticipantProjection;
}

function renderThemed(children: React.ReactNode) {
  return render(<ThemeProvider>{children}</ThemeProvider>);
}

afterEach(() => cleanup());

describe('participant rail canonical states', () => {
  const base = {
    selectedParticipantId: undefined,
    onSelectParticipant: () => undefined,
  };

  it('renders a canonical empty state with no participants', () => {
    renderThemed(<M11CParticipantRail participants={[]} {...base} />);
    expect(screen.getByText('No participants yet')).toBeDefined();
    expect(screen.getByText(/appear here when they join/)).toBeDefined();
  });

  it('renders a canonical empty state for unmatched filters', () => {
    renderThemed(<M11CParticipantRail participants={[participant()]} {...base} />);
    fireEvent.change(screen.getByLabelText('Search participants'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No matching participants')).toBeDefined();
  });

  it('lists participants and selects on activate', () => {
    const onSelectParticipant = vi.fn();
    renderThemed(
      <M11CParticipantRail participants={[participant()]} {...base} onSelectParticipant={onSelectParticipant} />,
    );
    fireEvent.click(screen.getByText('vestara-developer'));
    expect(onSelectParticipant).toHaveBeenCalled();
  });
});

describe('context panel canonical controls', () => {
  const stream = [
    {
      id: 's-1',
      sequence: 1,
      timestamp: '2026-09-16T01:00:00.000Z',
      kind: 'activity',
      importance: 'primary',
      actor: { type: 'agent', id: 'agent-1', displayName: 'vestara-developer' },
      content: 'Deployed the fix',
      fresh: false,
    },
  ] as const;

  it('fires operation controls and renders metrics with recent operations', () => {
    const onBroadcast = vi.fn();
    const onSnapshot = vi.fn();
    const onExport = vi.fn();
    const onSettings = vi.fn();
    renderThemed(
      <ActivityRoomContextPanel
        stream={[...stream]}
        participantCount={2}
        activeAgentCount={1}
        connectionState="live"
        onBroadcast={onBroadcast}
        onSnapshot={onSnapshot}
        onExport={onExport}
        onSettings={onSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Broadcast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Snapshot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onBroadcast).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Total Events')).toBeDefined();
    expect(screen.getByText('Deployed the fix')).toBeDefined();
  });
});

describe('Activity Room convergence boundaries', () => {
  it('introduces no Activity Room domain dependency into @vestara/ui', () => {
    const dir = path.resolve(__dirname, '../../../packages/ui/src');
    const files: string[] = [];
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(dir);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const imports = source.split('\n').filter((line) => line.startsWith('import '));
      expect(`${file}: ${imports.join(';')}`).not.toMatch(/activity-room|activity\//i);
    }
  });

  it('keeps domain ownership local (projection, composer, stream stay in activity/)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/pages/activity/M11CParticipantRail.tsx'),
      'utf8',
    );
    expect(source).toMatch(/@vestara\/activity-room/);
    expect(source).toMatch(/from '@vestara\/ui'/);
  });
});
