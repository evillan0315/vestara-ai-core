import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodePermissionsPage } from '../src/components/opencode/OpenCodePermissionsPage.js';
import type { OpenCodePermissionRequest } from '../src/lib/opencode.js';
import { ThemeProvider } from '../src/lib/theme.js';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
  respondToPermission: vi.fn(),
}));

vi.mock('../src/lib/opencode.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/opencode.js')>();
  return {
    ...original,
    openCodeApi: {
      ...original.openCodeApi,
      permissions: mocks.permissions,
      respondToPermission: mocks.respondToPermission,
    },
  };
});

const requests: OpenCodePermissionRequest[] = [
  {
    id: 'per_dangerous',
    action: 'write',
    resources: ['/home/user/project/src/**'],
    risk: 'dangerous',
    status: 'pending',
    sessionId: 'ses_1',
    askedAt: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'per_read',
    action: 'read',
    resources: ['/home/user/project'],
    risk: 'safe',
    status: 'pending',
    sessionId: 'ses_2',
    askedAt: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'per_unknown',
    action: 'widget',
    resources: ['x'],
    risk: 'safe',
    status: 'unknown',
    sessionId: 'ses_3',
    askedAt: '2026-08-05T00:00:00.000Z',
  },
];

function renderPermissions() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/opencode/permissions']}>
        <Routes>
          <Route path="/opencode/permissions" element={<OpenCodePermissionsPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.permissions.mockReset();
  mocks.respondToPermission.mockReset();
});

describe('OpenCodePermissionsPage', () => {
  it('renders pending permission requests with risk badges', async () => {
    mocks.permissions.mockResolvedValue(requests);
    renderPermissions();
    expect(await screen.findByText('OpenCode Permissions')).toBeTruthy();
    expect(screen.getByText('write')).toBeTruthy();
    expect(screen.getByText('read')).toBeTruthy();
    expect(screen.getAllByText('Dangerous').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Safe').length).toBeGreaterThan(0);
  });

  it('renders the empty state when there are no requests', async () => {
    mocks.permissions.mockResolvedValue([]);
    renderPermissions();
    expect(await screen.findByText('No pending permission requests.')).toBeTruthy();
  });

  it('filters by risk', async () => {
    mocks.permissions.mockResolvedValue(requests);
    renderPermissions();
    await screen.findByText('write');
    await userEvent.click(screen.getByRole('button', { name: 'Dangerous' }));
    expect(screen.getByText('write')).toBeTruthy();
    expect(screen.queryByText('read')).toBeNull();
  });

  it('shows the offline state when the runtime is unreachable', async () => {
    mocks.permissions.mockResolvedValue(null);
    renderPermissions();
    expect(await screen.findByText('OpenCode is unreachable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('approves a request for once scope after confirmation', async () => {
    mocks.permissions.mockResolvedValue(requests);
    mocks.respondToPermission.mockResolvedValue(true);
    renderPermissions();
    await screen.findByText('write');
    await userEvent.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Respond to permission request' });
    expect(within(dialog).getByRole('button', { name: 'Approve' })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mocks.respondToPermission).toHaveBeenCalledWith('ses_1', 'per_dangerous', 'approve', 'once'),
    );
    await waitFor(() => expect(screen.queryByText('write')).toBeNull());
  });

  it('approves a request for session scope', async () => {
    mocks.permissions.mockResolvedValue(requests);
    mocks.respondToPermission.mockResolvedValue(true);
    renderPermissions();
    await screen.findByText('write');
    await userEvent.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Respond to permission request' });
    await userEvent.click(within(dialog).getByLabelText('For this session'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mocks.respondToPermission).toHaveBeenCalledWith('ses_1', 'per_dangerous', 'approve', 'session'),
    );
  });

  it('rejects a request', async () => {
    mocks.permissions.mockResolvedValue(requests);
    mocks.respondToPermission.mockResolvedValue(true);
    renderPermissions();
    await screen.findByText('write');
    await userEvent.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Respond to permission request' });
    await userEvent.click(within(dialog).getByLabelText('Reject'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(mocks.respondToPermission).toHaveBeenCalledWith('ses_1', 'per_dangerous', 'reject', 'once'),
    );
  });

  it('surfaces respond failure without removing the request', async () => {
    mocks.permissions.mockResolvedValue(requests);
    mocks.respondToPermission.mockResolvedValue(false);
    renderPermissions();
    await screen.findByText('write');
    await userEvent.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Respond to permission request' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/Respond failed/)).toBeTruthy();
    expect(screen.getAllByText('write').length).toBeGreaterThan(0);
  });
});
