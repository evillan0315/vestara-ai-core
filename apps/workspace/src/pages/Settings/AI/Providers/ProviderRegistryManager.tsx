import { useCallback, useEffect, useState } from 'react';
import { Button, input, SettingsSection, Status } from '../../settings-ui.js';

interface ManagedModel {
  id: string;
  name: string;
  enabled: boolean;
  contextWindow: number;
  maxOutput: number;
  capabilities: { chat: boolean; streaming: boolean; functionCalling: boolean; vision: boolean };
}

interface ManagedProvider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  enabled: boolean;
  hasApiKey: boolean;
  builtIn: boolean;
  revision: number;
  status: string;
  credential?: { configured: boolean; source?: 'stored' | 'environment' };
  models: ManagedModel[];
  createdAt: string;
  updatedAt: string;
}

interface ProviderDraft {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
}

const EMPTY_PROVIDER: ProviderDraft = { id: '', name: '', baseUrl: '', apiKeyEnv: '', apiKey: '' };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Vestara-Actor': 'workspace-ui', ...options?.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Provider API ${response.status}`);
  return body;
}

const providerApi = {
  list: async () => (await request<{ providers: ManagedProvider[] }>('/api/providers')).providers,
  create: (provider: ProviderDraft) =>
    request<{ provider: ManagedProvider }>('/api/providers', { method: 'POST', body: JSON.stringify(provider) }),
  update: (id: string, update: Record<string, unknown>) =>
    request<{ provider: ManagedProvider }>(`/api/providers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),
  remove: (id: string) =>
    request<{ removed: boolean }>(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  action: (id: string, action: 'enable' | 'disable' | 'test' | 'discover-models') =>
    request<Record<string, unknown>>(`/api/providers/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
  setCredential: (id: string, apiKey: string) =>
    request(`/api/providers/${encodeURIComponent(id)}/credentials`, {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
  removeCredential: (id: string) =>
    request(`/api/providers/${encodeURIComponent(id)}/credentials`, { method: 'DELETE' }),
  createModel: (providerId: string, model: ManagedModel) =>
    request(`/api/providers/${encodeURIComponent(providerId)}/models`, {
      method: 'POST',
      body: JSON.stringify(model),
    }),
  updateModel: (providerId: string, modelId: string, model: Partial<ManagedModel>) =>
    request(`/api/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`, {
      method: 'PATCH',
      body: JSON.stringify(model),
    }),
  removeModel: (providerId: string, modelId: string) =>
    request(`/api/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`, {
      method: 'DELETE',
    }),
};

export function ProviderRegistryManager({ onChanged }: { onChanged(): void }) {
  const [providers, setProviders] = useState<ManagedProvider[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(EMPTY_PROVIDER);
  const [modelDraft, setModelDraft] = useState({ id: '', name: '', contextWindow: 128_000, maxOutput: 8_192 });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await providerApi.list();
      setProviders(next);
      setSelectedId((current) => (next.some((provider) => provider.id === current) ? current : (next[0]?.id ?? '')));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load provider registry');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const selected = providers.find((provider) => provider.id === selectedId);

  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Provider update failed');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    if (!selected) return;
    setProviderDraft({
      id: selected.id,
      name: selected.name,
      baseUrl: selected.baseUrl ?? '',
      apiKeyEnv: selected.apiKeyEnv ?? '',
      apiKey: '',
    });
    setEditing(true);
    setAdding(false);
  };

  const updateModel = (modelId: string, model: Partial<ManagedModel>) =>
    mutate(() => providerApi.updateModel(selectedId, modelId, model));

  const updateLocalModel = (modelId: string, update: Partial<ManagedModel>) =>
    setProviders((current) =>
      current.map((provider) =>
        provider.id === selectedId
          ? {
              ...provider,
              models: provider.models.map((model) => (model.id === modelId ? { ...model, ...update } : model)),
            }
          : provider,
      ),
    );

  return (
    <SettingsSection
      title="Provider Registry"
      description="Add, update, disable, or remove runtime providers. API keys are stored separately and never returned to the browser."
      actions={
        <Button
          primary
          onClick={() => {
            setProviderDraft(EMPTY_PROVIDER);
            setAdding(true);
            setEditing(false);
          }}
        >
          Add provider
        </Button>
      }
    >
      {error && (
        <div role="alert" className="border-b border-[var(--vestara-red)] px-4 py-3 text-sm text-[var(--vestara-red)]">
          {error}
        </div>
      )}
      <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-3 lg:border-r lg:border-b-0">
          <div className="space-y-1">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => {
                  setSelectedId(provider.id);
                  setAdding(false);
                  setEditing(false);
                }}
                className={`w-full rounded-[var(--vestara-radius)] border p-3 text-left ${selectedId === provider.id ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)]' : 'border-transparent hover:border-[var(--vestara-color-border-default,var(--color-zinc-700))]'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong>{provider.name}</strong>
                  <Status value={provider.enabled ? provider.status : 'disabled'} />
                </span>
                <span className="mt-1 block text-xs text-[var(--vestara-text-muted)]">
                  {provider.models.filter((model) => model.enabled).length}/{provider.models.length} models ·{' '}
                  {provider.hasApiKey ? 'key configured' : 'no stored key'}
                </span>
              </button>
            ))}
            {!providers.length && (
              <p className="p-4 text-sm text-[var(--vestara-text-muted)]">No providers configured.</p>
            )}
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          {adding || editing ? (
            <ProviderForm
              draft={providerDraft}
              setDraft={setProviderDraft}
              editing={editing}
              busy={busy}
              onCancel={() => {
                setAdding(false);
                setEditing(false);
              }}
              onSave={() =>
                void mutate(async () => {
                  if (editing) {
                    await providerApi.update(providerDraft.id, {
                      name: providerDraft.name,
                      baseUrl: providerDraft.baseUrl,
                      apiKeyEnv: providerDraft.apiKeyEnv || null,
                      ...(providerDraft.apiKey ? { apiKey: providerDraft.apiKey } : {}),
                    });
                  } else await providerApi.create(providerDraft);
                  setAdding(false);
                  setEditing(false);
                })
              }
            />
          ) : selected ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--vestara-text-muted)]">
                    {selected.baseUrl ?? 'No endpoint configured'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={startEdit}>Edit configuration</Button>
                  <Button
                    onClick={() =>
                      void mutate(() => providerApi.action(selected.id, selected.enabled ? 'disable' : 'enable'))
                    }
                  >
                    {selected.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button onClick={() => void mutate(() => providerApi.action(selected.id, 'test'))}>Test</Button>
                  <Button onClick={() => void mutate(() => providerApi.action(selected.id, 'discover-models'))}>
                    Discover models
                  </Button>
                  <Button
                    disabled={busy || selected.builtIn}
                    onClick={() => {
                      if (window.confirm(`Delete provider ${selected.name}?`))
                        void mutate(() => providerApi.remove(selected.id));
                    }}
                  >
                    {selected.builtIn ? 'Built-in' : 'Delete'}
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-[var(--vestara-text-muted)]">API key</span>
                  <p className="mt-1">{selected.hasApiKey ? 'Configured · value hidden' : 'Not configured'}</p>
                  {selected.hasApiKey && (
                    <button
                      type="button"
                      className="mt-2 text-[var(--vestara-red)] hover:underline"
                      onClick={() => void mutate(() => providerApi.removeCredential(selected.id))}
                    >
                      Remove stored key
                    </button>
                  )}
                </div>
                <div>
                  <span className="text-[var(--vestara-text-muted)]">Environment fallback</span>
                  <p className="mt-1 font-mono">{selected.apiKeyEnv ?? 'None'}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-2">
                <label className="flex-1 text-xs text-[var(--vestara-text-muted)]">
                  Model ID
                  <input
                    aria-label="New model ID"
                    className={`${input} mt-1 w-full`}
                    value={modelDraft.id}
                    onChange={(event) => setModelDraft((draft) => ({ ...draft, id: event.target.value }))}
                  />
                </label>
                <label className="w-32 text-xs text-[var(--vestara-text-muted)]">
                  Context window
                  <input
                    aria-label="New model context window"
                    type="number"
                    min={1}
                    className={`${input} mt-1 w-full`}
                    value={modelDraft.contextWindow}
                    onChange={(event) =>
                      setModelDraft((draft) => ({ ...draft, contextWindow: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="w-32 text-xs text-[var(--vestara-text-muted)]">
                  Max output
                  <input
                    aria-label="New model max output"
                    type="number"
                    min={1}
                    className={`${input} mt-1 w-full`}
                    value={modelDraft.maxOutput}
                    onChange={(event) =>
                      setModelDraft((draft) => ({ ...draft, maxOutput: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="flex-1 text-xs text-[var(--vestara-text-muted)]">
                  Display name
                  <input
                    aria-label="New model name"
                    className={`${input} mt-1 w-full`}
                    value={modelDraft.name}
                    onChange={(event) => setModelDraft((draft) => ({ ...draft, name: event.target.value }))}
                  />
                </label>
                <Button
                  primary
                  disabled={!modelDraft.id || busy}
                  onClick={() =>
                    void mutate(() =>
                      providerApi.createModel(selected.id, {
                        id: modelDraft.id,
                        name: modelDraft.name || modelDraft.id,
                        enabled: true,
                        contextWindow: modelDraft.contextWindow,
                        maxOutput: modelDraft.maxOutput,
                        capabilities: { chat: true, streaming: true, functionCalling: true, vision: false },
                      }),
                    ).then(() => setModelDraft({ id: '', name: '', contextWindow: 128_000, maxOutput: 8_192 }))
                  }
                >
                  Add model
                </Button>
              </div>
              <div className="mt-3 divide-y divide-[var(--vestara-color-border-subtle,var(--color-zinc-800))] rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
                {selected.models.map((model) => (
                  <div
                    key={model.id}
                    className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto_auto] sm:items-end"
                  >
                    <div className="text-xs text-[var(--vestara-text-muted)]">
                      Display name
                      <input
                        aria-label={`${model.id} name`}
                        className={`${input} w-full`}
                        value={model.name}
                        onChange={(event) => updateLocalModel(model.id, { name: event.target.value })}
                        onBlur={() => void updateModel(model.id, { name: model.name })}
                      />
                      <p className="mt-1 font-mono text-[10px] text-[var(--vestara-text-muted)]">
                        {model.id}
                      </p>
                    </div>
                    <label className="text-xs text-[var(--vestara-text-muted)]">
                      Context
                      <input
                        aria-label={`${model.id} context window`}
                        type="number"
                        min={1}
                        className={`${input} mt-1 w-full`}
                        value={model.contextWindow}
                        onChange={(event) => updateLocalModel(model.id, { contextWindow: Number(event.target.value) })}
                        onBlur={() => void updateModel(model.id, { contextWindow: model.contextWindow })}
                      />
                    </label>
                    <label className="text-xs text-[var(--vestara-text-muted)]">
                      Max output
                      <input
                        aria-label={`${model.id} max output`}
                        type="number"
                        min={1}
                        className={`${input} mt-1 w-full`}
                        value={model.maxOutput}
                        onChange={(event) => updateLocalModel(model.id, { maxOutput: Number(event.target.value) })}
                        onBlur={() => void updateModel(model.id, { maxOutput: model.maxOutput })}
                      />
                    </label>
                    <Button
                      onClick={() =>
                        void updateModel(model.id, { enabled: !model.enabled })
                      }
                    >
                      {model.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button onClick={() => void mutate(() => providerApi.removeModel(selected.id, model.id))}>
                      Delete
                    </Button>
                  </div>
                ))}
                {!selected.models.length && (
                  <p className="p-5 text-center text-sm text-[var(--vestara-text-muted)]">No models registered.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--vestara-text-muted)]">Select or add a provider.</p>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}

function ProviderForm({
  draft,
  setDraft,
  editing,
  busy,
  onCancel,
  onSave,
}: {
  draft: ProviderDraft;
  setDraft(value: ProviderDraft): void;
  editing: boolean;
  busy: boolean;
  onCancel(): void;
  onSave(): void;
}) {
  const field = (key: keyof ProviderDraft, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <div>
      <h3 className="text-lg font-semibold">{editing ? 'Update provider' : 'Add provider'}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-[var(--vestara-text-muted)]">
          Provider ID
          <input
            aria-label="Provider ID"
            disabled={editing}
            className={`${input} mt-1 w-full`}
            value={draft.id}
            onChange={(event) => field('id', event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
          />
        </label>
        <label className="text-xs text-[var(--vestara-text-muted)]">
          Display name
          <input
            aria-label="Provider name"
            className={`${input} mt-1 w-full`}
            value={draft.name}
            onChange={(event) => field('name', event.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--vestara-text-muted)] sm:col-span-2">
          Base URL
          <input
            aria-label="Provider base URL"
            className={`${input} mt-1 w-full font-mono`}
            placeholder="https://provider.example/v1"
            value={draft.baseUrl}
            onChange={(event) => field('baseUrl', event.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--vestara-text-muted)]">
          API key environment variable
          <input
            aria-label="API key environment variable"
            className={`${input} mt-1 w-full font-mono`}
            value={draft.apiKeyEnv}
            onChange={(event) => field('apiKeyEnv', event.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--vestara-text-muted)]">
          {editing ? 'Replace API key' : 'API key'}
          <input
            aria-label="Provider API key"
            type="password"
            autoComplete="new-password"
            className={`${input} mt-1 w-full font-mono`}
            placeholder={editing ? 'Leave blank to keep current key' : 'Optional'}
            value={draft.apiKey}
            onChange={(event) => field('apiKey', event.target.value)}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-[var(--vestara-text-muted)]">
        The API key is sent once, stored with owner-only permissions, and never returned to this page.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button primary disabled={busy || !draft.id || !draft.name || !draft.baseUrl} onClick={onSave}>
          {busy ? 'Saving…' : editing ? 'Update provider' : 'Add provider'}
        </Button>
      </div>
    </div>
  );
}
