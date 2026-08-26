/**
 * AgentDetailDrawer — detailed agent view opened from the Activity Room.
 *
 * Shows the live workflow participant context (execution state, thread, last
 * activity) alongside the registered agent configuration. The provider/model/
 * runtime agent are editable in place and persisted through the same agent
 * registry API the Agent Control modal uses (`PUT /api/agents/:id`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import type { WorkflowParticipant } from './activity-types';

export interface AgentDetailDrawerProps {
  open: boolean;
  /** Participant/agent id the drawer inspects (e.g. `vestara-planner`). */
  agentId: string | null;
  onClose: () => void;
  /** Live workflow participant context, when the id came from a workflow. */
  participant?: WorkflowParticipant | null;
  /** Fired after a successful provider/model/runtime-agent save. */
  onSaved?: () => void;
}

interface ProviderOption {
  id: string;
  name: string;
  models: string[];
}

interface RegisteredAgent {
  id: string;
  name: string;
  role: string;
  description?: string;
  status: string;
  provider?: string;
  model?: string;
  runtimeAgent?: string;
}

interface RuntimeAgentOption {
  name: string;
  description?: string;
}

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function agentKey(agentId: string): string {
  return agentId.toLowerCase();
}

export default function AgentDetailDrawer({
  open,
  agentId,
  onClose,
  participant,
  onSaved,
}: AgentDetailDrawerProps) {
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [runtimeAgents, setRuntimeAgents] = useState<RuntimeAgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [runtimeAgent, setRuntimeAgent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [savedAt, setSavedAt] = useState<string>();

  const load = useCallback(async () => {
    if (!open || !agentId) return;
    setLoading(true);
    setError(undefined);
    setSavedAt(undefined);
    const [agentsRes, providersRes, runtimeRes] = await Promise.all([
      fetchJSON<{ agents: RegisteredAgent[] }>('/api/agents'),
      fetchJSON<{ providers: ProviderOption[] }>('/api/opencode/providers'),
      fetchJSON<{ agents: RuntimeAgentOption[] }>('/api/opencode/agents'),
    ]);
    const candidates = agentsRes?.agents ?? [];
    const found = candidates.find(
      (candidate) =>
        agentKey(candidate.id) === agentKey(agentId) ||
        agentKey(candidate.runtimeAgent ?? '') === agentKey(agentId) ||
        agentKey(candidate.role) === agentKey(agentId),
    );
    setAgent(found ?? null);
    setProviders(
      (providersRes?.providers ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id, models: p.models ?? [] })),
    );
    setRuntimeAgents(runtimeRes?.agents ?? []);
    setProvider(found?.provider ?? '');
    setModel(found?.model ?? '');
    setRuntimeAgent(found?.runtimeAgent ?? '');
    setLoading(false);
  }, [open, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerModels = useMemo(
    () => providers.find((p) => p.id === provider)?.models ?? [],
    [providers, provider],
  );

  const modelOptions = useMemo(() => {
    const options = providerModels.map((id) => ({ id }));
    if (model && !options.some((option) => option.id === model)) {
      options.unshift({ id: model });
    }
    return options;
  }, [providerModels, model]);

  const save = async () => {
    if (!agent) {
      setError('This agent is not registered in the Agent Registry — edit it from the Agent Control page.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider || undefined,
          model: model || undefined,
          runtimeAgent: runtimeAgent || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Failed to save agent (HTTP ${res.status}).`);
        return;
      }
      setSavedAt(new Date().toISOString());
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent.');
    } finally {
      setSaving(false);
    }
  };

  const displayName = agent?.name ?? (participant?.role ? participant.role[0].toUpperCase() + participant.role.slice(1) : agentId ?? 'Agent');
  const inputClass =
    'w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active) transition-colors';
  const labelClass = 'text-[10px] text-(--vestara-text-muted) uppercase tracking-wider block mb-1';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={displayName}
      position="right"
      defaultSize="medium"
      storageKey="activity-room-agent"
      header={
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] ${
            agent?.status === 'active'
              ? 'border-(--vestara-green-border) bg-(--vestara-green-bg) text-(--vestara-green)'
              : 'border-(--vestara-accent-border) text-(--vestara-text-muted)'
          }`}
        >
          {agent?.status ?? 'workflow'}
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="flex-1 rounded-lg border border-(--vestara-accent-border-active) bg-(--vestara-accent-bg) px-3 py-2 text-xs font-medium text-(--vestara-accent-text) transition-colors hover:bg-(--vestara-accent-border)/20 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save provider / model'}
          </button>
          {savedAt && (
            <span className="text-[10px] text-(--vestara-green)" role="status">
              Saved
            </span>
          )}
        </div>
      }
      bodyClassName="px-4 py-3"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Identity</div>
          <div className="space-y-1">
            <DetailRow label="Agent id" value={agentId ?? '—'} />
            {participant && (
              <>
                <DetailRow label="Role" value={participant.role} />
                <DetailRow label="Execution" value={participant.executionState} />
                <DetailRow label="Thread" value={participant.threadId} />
                <DetailRow label="Last activity" value={participant.lastActivityAt ?? '—'} />
              </>
            )}
            {agent?.description && <DetailRow label="Description" value={agent.description} />}
          </div>
        </div>

        <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">
            Runtime execution
          </div>
          <p className="mb-3 text-[10px] text-(--vestara-text-muted)">
            Providers and models load from the OpenCode runtime discovery — the same source the agent harness uses.
          </p>
          {loading ? (
            <div className="text-[10px] text-(--vestara-text-muted)">Loading provider/model…</div>
          ) : (
            <div className="space-y-3">
              {!agent && (
                <p className="rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)">
                  Not registered in the Agent Registry. Provider/model can be configured from the Agent Control page.
                </p>
              )}
              <div>
                <label className={labelClass}>
                  Runtime agent <span className="normal-case font-normal text-(--vestara-accent-text)">(OpenCode)</span>
                </label>
                <select
                  value={runtimeAgent}
                  onChange={(e) => setRuntimeAgent(e.target.value)}
                  disabled={!agent}
                  className={`${inputClass} cursor-pointer`}
                >
                  {runtimeAgent && !runtimeAgents.some((a) => a.name === runtimeAgent) && (
                    <option value={runtimeAgent}>{runtimeAgent} (current)</option>
                  )}
                  {runtimeAgents.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                      {a.description ? ` — ${a.description}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    const next = providers.find((p) => p.id === e.target.value);
                    const firstModel = next?.models[0];
                    if (firstModel) setModel(firstModel);
                  }}
                  disabled={!agent || providers.length === 0}
                  className={`${inputClass} cursor-pointer`}
                >
                  {providers.length === 0 && <option value="">No providers discovered</option>}
                  {agent?.provider && !providers.some((p) => p.id === agent.provider) && (
                    <option value={agent.provider}>{agent.provider} (current)</option>
                  )}
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Model</label>
                {modelOptions.length > 0 ? (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={!agent}
                    className={`${inputClass} cursor-pointer`}
                  >
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={!agent}
                    placeholder={provider ? `No models for ${provider} — enter a model id` : 'Model id'}
                    className={inputClass}
                  />
                )}
              </div>
              {error && (
                <p className="rounded-lg border border-(--vestara-red-border) bg-(--vestara-red-bg) px-3 py-2 text-[10px] text-(--vestara-red)" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[10px] text-(--vestara-text-muted)">{label}</span>
      <span className="break-all text-right text-[10px] text-(--vestara-text-2)">{value}</span>
    </div>
  );
}
