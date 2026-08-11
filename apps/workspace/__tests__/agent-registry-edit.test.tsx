import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentRegistryModal from '../src/pages/Agents/AgentRegistryModal.js';
import type { Agent } from '../src/pages/Agents/types.js';

function json(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

const savedAgent: Agent = {
  id: 'agent-1',
  name: 'Planner',
  role: 'planner',
  agentType: 'workspace',
  description: 'Plans',
  capabilities: [],
  permissions: [],
  provider: 'opencode-go',
  model: 'deepseek-v4-flash',
  runtimeAgent: 'planner',
  teamId: '',
  color: '#6b7280',
  status: 'active',
  createdAt: new Date().toISOString(),
};

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
      if (u.includes('/api/opencode/agents')) {
        return json({
          agents: [
            { name: 'build', description: 'Default agent' },
            { name: 'planner', description: 'Plans' },
            { name: 'reviewer', description: 'Reviews' },
          ],
        });
      }
      if (u.includes('/api/providers')) {
        return json({ providers: [] });
      }
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgentRegistryModal edit-save flow', () => {
  const comboboxWith = (text: string) =>
    screen.getAllByRole('combobox').find((box) => [...box.options].some((o) => o.textContent?.includes(text)));

  it('initializes an edited agent with its saved provider and model', async () => {
    render(<AgentRegistryModal agent={savedAgent} teams={[]} onSave={() => {}} onClose={() => {}} />);

    await waitFor(() => expect(comboboxWith('opencode-go')?.value).toBe('opencode-go'));
    await waitFor(() => expect(comboboxWith('deepseek-v4-flash')?.value).toBe('deepseek-v4-flash'));
  });

  it('passes the changed provider and model through onSave', async () => {
    let saved: Partial<Agent> | null = null;
    render(
      <AgentRegistryModal
        agent={savedAgent}
        teams={[]}
        onSave={(a) => {
          saved = a;
        }}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(comboboxWith('opencode-go')?.value).toBe('opencode-go'));
    await waitFor(() => expect(comboboxWith('deepseek-v4-flash')?.value).toBe('deepseek-v4-flash'));

    // Runtime agent initializes from the saved agent.
    await waitFor(() => expect(screen.getByDisplayValue('planner')).toBeTruthy());

    // Change provider → auto-selects its first model.
    fireEvent.change(comboboxWith('opencode-go') as HTMLSelectElement, { target: { value: 'opencode' } });
    await waitFor(() => expect(comboboxWith('deepseek-v4-flash-free')?.value).toBe('deepseek-v4-flash-free'));

    // Change the runtime agent (the runtime-agent select is identified by the
    // 'build' option — the Role select also lists 'planner').
    const runtimeSelect = comboboxWith('build') as HTMLSelectElement;
    expect(runtimeSelect.value).toBe('planner');
    fireEvent.change(runtimeSelect, { target: { value: 'reviewer' } });
    await waitFor(() => expect(runtimeSelect.value).toBe('reviewer'));

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved?.provider).toBe('opencode');
    expect(saved?.model).toBe('deepseek-v4-flash-free');
    expect(saved?.runtimeAgent).toBe('reviewer');
  });
});
