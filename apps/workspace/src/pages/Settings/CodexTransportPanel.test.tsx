/** @vitest-environment jsdom */

import type { ResolvedConfiguration } from '@vestara/configuration';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodexTransportPanel } from './CodexTransportPanel';

const configuration: ResolvedConfiguration = {
  workspaceId: 'workspace-test',
  revision: 'revision-test',
  generatedAt: '2026-09-28T00:00:00.000Z',
  userConfigPath: '/tmp/user.json',
  workspaceConfigPath: '/tmp/config.json',
  overrideCount: 0,
  settings: [
    {
      key: 'runtime.codexTransport',
      section: 'runtime',
      value: 'app-server',
      source: 'default',
      inherited: false,
      sensitive: false,
    },
  ],
};

describe('CodexTransportPanel', () => {
  it('uses the shared ReferenceCard surface and persists transport selection', async () => {
    const nextConfiguration = {
      ...configuration,
      revision: 'revision-next',
      settings: configuration.settings.map((setting) => ({ ...setting, value: 'sdk' as const, source: 'workspace' as const })),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ configuration: nextConfiguration }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onChanged = vi.fn();

    render(<CodexTransportPanel configuration={configuration} onChanged={onChanged} />);

    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Codex documentation' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Documentation' }));
    expect(screen.getByRole('dialog', { name: 'Codex documentation' })).toBeTruthy();
    expect(screen.getByText('Current configuration')).toBeTruthy();
    expect(screen.getByText('Configuration')).toBeTruthy();
    expect(screen.getByText('How to')).toBeTruthy();
    expect(screen.getByText('Architecture')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Related documentation')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Codex App Server runbook' })).toHaveAttribute(
      'href',
      `/docs?path=${encodeURIComponent('docs/CODEX-APP-SERVER-RUNBOOK.md')}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(screen.queryByRole('dialog', { name: 'Codex documentation' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Codex runtime transport' })).toHaveValue('app-server');
    fireEvent.change(screen.getByRole('combobox', { name: 'Codex runtime transport' }), { target: { value: 'sdk' } });

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(nextConfiguration));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('runtime.codexTransport') }),
    );
    expect(screen.getByText(/bounded compatibility option/)).toBeTruthy();
  });
});
