import { useEffect, useState } from 'react';
import {
  fetchProviders,
  fetchRoutingSelection,
  type LiveProvider,
  type ProviderModelRef,
  ProvidersApiError,
  type RoutingSelection,
  saveRoutingAssignment,
} from '../lib/providers';
import {
  PROVIDERS_FIXTURE,
  PROVIDERS_HELP,
  PROVIDERS_OFFLINE_NOTE,
  PROVIDERS_UNAUTHORIZED_NOTE,
  ROUTING_SELECTION_FIXTURE,
} from './providers.fixtures';

type LoadState = 'loading' | 'live' | 'fixture';

function modelName(providers: readonly LiveProvider[], ref: ProviderModelRef): string {
  const provider = providers.find((p) => p.id === ref.providerId);
  const model = provider?.models.find((m) => m.id === ref.modelId);
  return `${provider?.name ?? ref.providerId} / ${model?.name ?? ref.modelId}`;
}

export function ProviderModelPicker() {
  const [providers, setProviders] = useState<readonly LiveProvider[]>(PROVIDERS_FIXTURE);
  const [selection, setSelection] = useState<RoutingSelection>(ROUTING_SELECTION_FIXTURE);
  const [state, setState] = useState<LoadState>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [liveProviders, liveSelection] = await Promise.all([fetchProviders(), fetchRoutingSelection()]);
        if (cancelled) return;
        if (liveProviders.length > 0) setProviders(liveProviders);
        if (liveSelection) setSelection(liveSelection);
        setState('live');
      } catch {
        if (!cancelled) {
          setState('fixture');
          setNotice(PROVIDERS_OFFLINE_NOTE);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const roles = Object.keys(selection.selection.roles);
  const allModels: { provider: LiveProvider; modelId: string; label: string }[] = providers.flatMap((p) =>
    p.models.map((m) => ({ provider: p, modelId: m.id, label: `${p.name} / ${m.name}` })),
  );

  const assign = async (role: string, ref: ProviderModelRef) => {
    setSavingRole(role);
    setNotice(null);
    try {
      const next = await saveRoutingAssignment(selection, role, ref);
      setSelection(next);
    } catch (e) {
      if (e instanceof ProvidersApiError && (e.status === 401 || e.status === 403)) {
        setNotice(PROVIDERS_UNAUTHORIZED_NOTE);
      } else if (e instanceof ProvidersApiError && e.status === 409) {
        setNotice('Routing changed in another client — reloading.');
        try {
          const fresh = await fetchRoutingSelection();
          if (fresh) setSelection(fresh);
        } catch {
          // Keep the stale view; the next save retries against it.
        }
      } else {
        setNotice(e instanceof Error ? e.message : 'Save failed.');
      }
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
      <div className="flex items-center gap-2 text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
        <span>PROVIDERS • MODELS</span>
        <span
          className={`rounded-full border px-2 py-px ${
            state === 'live'
              ? 'border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 text-[var(--vestara-status-shell-success)]'
              : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-muted)]'
          }`}
        >
          {state === 'live' ? 'LIVE' : state === 'loading' ? '…' : 'SNAPSHOT'}
        </span>
      </div>
      <div className="mt-1 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
        {PROVIDERS_HELP}
      </div>

      <div className="mt-3 space-y-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${p.enabled ? 'bg-[var(--vestara-status-shell-success)]' : 'bg-[var(--vestara-text-shell-muted)]'}`}
              />
              <span className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
                {p.name}
              </span>
              <span className="ml-auto text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-muted)]">
                {p.status} • {p.models.length} models
              </span>
            </div>
            <div className="mt-1 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-secondary)]">
              {p.models.map((m) => m.name).join(' · ') || 'no models'}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
        ROLE ROUTING • {selection.selection.profileId} (rev {selection.revision})
      </div>
      {roles.length === 0 ? (
        <div className="mt-1 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-faint)]">
          No role assignments yet — the API reports an empty selection.
        </div>
      ) : (
        <div className="mt-2 space-y-2" aria-busy={savingRole !== null}>
          {roles.map((role) => {
            const current = selection.selection.roles[role];
            const value = current ? `${current.providerId}/${current.modelId}` : '';
            return (
              <label key={role} className="block">
                <span className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] font-mono">
                  {role.toUpperCase()}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <select
                    aria-label={`Provider and model for ${role}`}
                    value={value}
                    disabled={savingRole !== null || allModels.length === 0}
                    onChange={(e) => {
                      const [providerId, modelId] = e.target.value.split('/');
                      if (providerId && modelId) void assign(role, { providerId, modelId });
                    }}
                    className="flex-1 h-9 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] px-2 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] outline-none focus:border-[var(--vestara-accent-shell)]/40 disabled:opacity-60"
                  >
                    {!current && <option value="">Unassigned</option>}
                    {allModels.map((opt) => (
                      <option key={`${opt.provider.id}/${opt.modelId}`} value={`${opt.provider.id}/${opt.modelId}`}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {current && (
                    <span className="text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-faint)]">
                      {modelName(providers, current)}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-2 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-status-shell-warning)]"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
