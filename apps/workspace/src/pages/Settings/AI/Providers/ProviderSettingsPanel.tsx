import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type EngineeringAgentRole,
  type ProviderModelRef,
  type RoutingCandidate,
  type RoutingCatalog,
  RoutingRevisionConflictError,
  routingClient,
  type VersionedRoutingSelection,
} from '../../../../lib/routing.js';
import { Button, input, SettingsSection, Status } from '../../settings-ui.js';
import { ProviderRegistryManager } from './ProviderRegistryManager.js';

const ROLES: readonly EngineeringAgentRole[] = [
  'planner',
  'architect',
  'developer',
  'reviewer',
  'verifier',
  'documentation',
];

interface ProviderGroup {
  id: string;
  name: string;
  locality: string;
  candidates: RoutingCandidate[];
}

const PROVIDER_DETAILS: Record<string, { endpoint: string; credential: string; description: string }> = {
  openai: {
    endpoint: 'https://api.openai.com/v1',
    credential: 'OPENAI_API_KEY',
    description: 'OpenAI GPT models for reasoning, coding, tool use, and multimodal engineering workflows.',
  },
  opencode: {
    endpoint: 'https://opencode.ai/zen/v1',
    credential: 'Optional for free models',
    description: 'OpenCode Zen models through the OpenAI-compatible chat API.',
  },
  'opencode-go': {
    endpoint: 'https://opencode.ai/zen/go/v1',
    credential: 'OPENCODE_GO_API_KEY',
    description: 'OpenCode Go subscription models with provider-scoped routing.',
  },
};

function groupProviders(catalog: RoutingCatalog): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const candidate of catalog.candidates) {
    const current = groups.get(candidate.ref.providerId);
    if (current) current.candidates.push(candidate);
    else {
      groups.set(candidate.ref.providerId, {
        id: candidate.ref.providerId,
        name: candidate.providerName,
        locality: candidate.locality,
        candidates: [candidate],
      });
    }
  }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function candidateKey(ref: ProviderModelRef): string {
  return `${ref.providerId}/${ref.modelId}`;
}

export function ProviderSettingsPanel() {
  const [catalog, setCatalog] = useState<RoutingCatalog | null>(null);
  const [selection, setSelection] = useState<VersionedRoutingSelection | null>(null);
  const [draft, setDraft] = useState<VersionedRoutingSelection['selection'] | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextCatalog, nextSelection] = await Promise.all([routingClient.catalog(), routingClient.selection()]);
      const providers = groupProviders(nextCatalog);
      setCatalog(nextCatalog);
      setSelection(nextSelection);
      setDraft(structuredClone(nextSelection.selection));
      setSelectedProviderId((current) => current || providers[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Provider catalog is unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providers = useMemo(() => (catalog ? groupProviders(catalog) : []), [catalog]);
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0];
  const visibleModels = (selectedProvider?.candidates ?? []).filter((candidate) =>
    `${candidate.ref.modelId} ${candidate.capabilities.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  );
  const configuredProviderCount = new Set(Object.values(draft?.roles ?? {}).map((route) => route?.providerId)).size;

  const updateRole = (role: EngineeringAgentRole, providerId: string, modelId?: string) => {
    if (!draft || !catalog) return;
    const fallback = catalog.candidates.find(
      (candidate) => candidate.ref.providerId === providerId && candidate.availability.available,
    );
    const nextModel = modelId ?? fallback?.ref.modelId;
    if (!nextModel) return;
    setSaved(false);
    setDraft({ ...draft, roles: { ...draft.roles, [role]: { providerId, modelId: nextModel } } });
  };

  const save = async () => {
    if (!selection || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await routingClient.updateSelection(draft, selection.revision);
      setSelection(updated);
      setDraft(structuredClone(updated.selection));
      setSaved(true);
    } catch (cause) {
      if (cause instanceof RoutingRevisionConflictError) {
        setError(`Routing changed in ${cause.current.updatedByClientId}. Reload before saving.`);
      } else setError(cause instanceof Error ? cause.message : 'Unable to save provider routing');
    } finally {
      setBusy(false);
    }
  };

  if (!catalog || !selection || !draft) {
    return (
      <SettingsSection title="AI Provider Configuration" description="Loading the runtime provider catalog…">
        <div className="p-5 text-sm text-[var(--vestara-text-muted)]">
          {error ? (
            <div role="alert">
              <p>{error}</p>
              <div className="mt-3">
                <Button onClick={() => void load()}>Retry</Button>
              </div>
            </div>
          ) : (
            'Loading providers and models…'
          )}
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <ProviderRegistryManager onChanged={() => void load()} />
      <SettingsSection
        title="AI Provider Configuration"
        description="Configure multiple provider/model defaults by agent role. Running tasks keep their existing assignment."
        actions={<span className="text-xs text-[var(--vestara-text-muted)]">Revision {selection.revision}</span>}
      >
        <div className="grid gap-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-3 lg:border-r lg:border-b-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--vestara-text-muted)]">
                Installed providers
              </span>
              <span className="font-mono text-xs">{providers.length}</span>
            </div>
            <div className="space-y-1">
              {providers.map((provider) => {
                const healthy = provider.candidates.some((candidate) => candidate.availability.available);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setQuery('');
                    }}
                    className={`w-full rounded-[var(--vestara-radius)] border p-3 text-left transition-colors ${selectedProvider?.id === provider.id ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)]' : 'border-transparent hover:border-[var(--vestara-color-border-default,var(--color-zinc-700))]'}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{provider.name}</span>
                      <Status value={healthy ? 'available' : 'unavailable'} />
                    </span>
                    <span className="mt-1 block text-xs text-[var(--vestara-text-muted)]">
                      {provider.candidates.length} models · {provider.locality}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedProvider && (
            <div className="min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{selectedProvider.name}</h3>
                  <p className="mt-1 text-sm text-[var(--vestara-text-muted)]">
                    {PROVIDER_DETAILS[selectedProvider.id]?.description ?? 'Runtime-registered engineering provider.'}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--vestara-color-border-default,var(--color-zinc-700))] px-2.5 py-1 text-xs">
                  {selectedProvider.id}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--vestara-text-muted)]">Endpoint</dt>
                  <dd className="mt-1 break-all font-mono">
                    {PROVIDER_DETAILS[selectedProvider.id]?.endpoint ?? 'Extension managed'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--vestara-text-muted)]">Credential source</dt>
                  <dd className="mt-1 font-mono">
                    {PROVIDER_DETAILS[selectedProvider.id]?.credential ?? 'Provider managed'}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h4 className="font-medium">Models</h4>
                  <p className="text-xs text-[var(--vestara-text-muted)]">
                    Select models below when assigning role defaults.
                  </p>
                </div>
                <input
                  aria-label="Search provider models"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search models…"
                  className={`${input} w-full sm:w-64`}
                />
              </div>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
                {visibleModels.map((candidate) => (
                  <div
                    key={candidateKey(candidate.ref)}
                    className="flex items-center justify-between gap-4 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-3 py-2.5 first:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">{candidate.ref.modelId}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--vestara-text-muted)]">
                        {candidate.capabilities.join(' · ') || 'Conversation'}
                      </p>
                    </div>
                    <Status value={candidate.availability.state} />
                  </div>
                ))}
                {!visibleModels.length && (
                  <p className="p-5 text-center text-sm text-[var(--vestara-text-muted)]">No matching models.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Role Provider and Model Defaults"
        description={`${configuredProviderCount} provider${configuredProviderCount === 1 ? '' : 's'} currently assigned across future engineering work.`}
        actions={
          <Button primary disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save routing defaults'}
          </Button>
        }
      >
        <div className="divide-y divide-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
          {ROLES.map((role) => {
            const route = draft.roles[role];
            const providerId = route?.providerId ?? providers[0]?.id ?? '';
            const models = providers.find((provider) => provider.id === providerId)?.candidates ?? [];
            return (
              <div key={role} className="grid gap-3 p-4 sm:grid-cols-[9rem_1fr_1fr] sm:items-center sm:px-5">
                <label htmlFor={`provider-${role}`} className="font-medium capitalize">
                  {role}
                </label>
                <select
                  id={`provider-${role}`}
                  aria-label={`${role} provider`}
                  className={input}
                  value={providerId}
                  onChange={(event) => updateRole(role, event.target.value)}
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${role} model`}
                  className={input}
                  value={route?.modelId ?? models[0]?.ref.modelId ?? ''}
                  onChange={(event) => updateRole(role, providerId, event.target.value)}
                >
                  {models.map((candidate) => (
                    <option
                      key={candidateKey(candidate.ref)}
                      value={candidate.ref.modelId}
                      disabled={!candidate.availability.available}
                    >
                      {candidate.ref.modelId} · {candidate.availability.state}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <footer className="flex min-h-12 items-center justify-between gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-xs sm:px-5">
          <span
            className={error ? 'text-[var(--vestara-red)]' : 'text-[var(--vestara-text-muted)]'}
            role={error ? 'alert' : undefined}
          >
            {error ??
              (saved
                ? 'Routing defaults saved and synchronized with CLI/TUI.'
                : 'Changes apply to future and unassigned tasks only.')}
          </span>
          <Button onClick={() => void load()}>Reload catalog</Button>
        </footer>
      </SettingsSection>
    </div>
  );
}
