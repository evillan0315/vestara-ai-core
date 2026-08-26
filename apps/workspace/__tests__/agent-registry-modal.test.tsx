import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentRegistryModal from '../src/pages/Agents/AgentRegistryModal.js';
import type { Agent, Team } from '../src/pages/Agents/types.js';

function json(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

const emptyAgent: Agent = {
  id: '',
  name: '',
  role: 'custom',
  agentType: 'workspace',
  description: '',
  capabilities: [],
  permissions: [],
  status: 'unregistered',
  color: '#6b7280',
  createdAt: '',
};

function renderModal(agent: Agent | null = emptyAgent, teams: Team[] = []) {
  return render(
    <AgentRegistryModal agent={agent} teams={teams} onSave={() => {}} onClose={() => {}} />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api/opencode/providers')) {
        return json({
          providers: [
            { id: 'opencode-go', name: 'OpenCode Go', models: ['deepseek-v4-flash', 'mimo-v2.5'] },
            { id: 'opencode', name: 'OpenCode', models: ['deepseek-v4-flash-free'] },
          ],
        });
      }
      if (u.includes('/api/providers')) {
        return json({
          providers: [{ id: 'legacy', name: 'Legacy Config', enabled: true, status: 'available', models: [{ id: 'old-model', name: 'Old Model', enabled: true }] }],
        });
      }
      if (u.includes('/api/routing/selection')) return json({});
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgentRegistryModal', () => {
  const comboboxWith = (text: string) =>
    screen.getAllByRole('combobox').find((box) =>
      [...box.options].some((o) => o.textContent?.includes(text)),
    );

  it('sources workspace-agent providers and models from the OpenCode runtime', async () => {
    renderModal();

    await waitFor(() =>
      expect(screen.getAllByText('OpenCode runtime', { exact: false }).length).toBeGreaterThan(0),
    );

    const provider = comboboxWith('opencode-go');
    expect(provider).toBeDefined();
    // Wait for the applied default (workspace agent → first runtime provider).
    await waitFor(() => expect(provider?.value).toBe('opencode-go'));
    // Runtime discovery is used, not the /api/providers config fallback.
    expect(comboboxWith('legacy')).toBeUndefined();

    // Model options follow the selected runtime provider.
    await waitFor(() => expect(comboboxWith('deepseek-v4-flash')).toBeDefined());
    const model = comboboxWith('deepseek-v4-flash');
    expect(model?.value).toBe('deepseek-v4-flash');
  });

  it('switches to registry fields when the registry agent type is selected', async () => {
    renderModal();
    await waitFor(() => expect(comboboxWith('opencode-go')).toBeDefined());

    fireEvent.click(screen.getByRole('radio', { name: /Registry Agent/ }));

    expect(screen.getByPlaceholderText('e.g. @vestara/agent-pack')).toBeTruthy();
    expect(comboboxWith('opencode-go')).toBeUndefined();
    expect(comboboxWith('deepseek-v4-flash')).toBeUndefined();
  });
});
