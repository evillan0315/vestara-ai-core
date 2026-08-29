import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VestaraModal } from '../../components/ui/VestaraModal';
import type { Agent, AgentType, Team } from './types';

interface AgentRegistryModalProps {
  agent: Agent | null;
  teams: Team[];
  onSave: (a: Partial<Agent>) => void;
  onClose: () => void;
}

interface ProviderOption {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  models: Array<{ id: string; name: string; enabled: boolean; contextWindow?: number }>;
}

interface RoutingSelectionResponse {
  selection?: {
    roles?: Partial<Record<string, { providerId: string; modelId: string }>>;
  };
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

const ROLES = [
  'architect', 'developer', 'verifier', 'reviewer', 'tester', 'documenter',
  'analyst', 'security-agent', 'performance-agent', 'documentation-agent',
  'refactoring-agent', 'release-agent', 'conversation', 'planner', 'frontend',
  'dashboard-curator',
];

const inputClass =
  'w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active) transition-colors';
const labelClass = 'text-[10px] text-(--vestara-text-muted) uppercase tracking-wider block mb-1';

export default function AgentRegistryModal({ agent, teams, onSave, onClose }: AgentRegistryModalProps) {
  const isNewRegistration = !agent?.id || agent?.id?.startsWith('slot-') || agent?.status === 'unregistered';
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(agent?.name || '');
  const [role, setRole] = useState(agent?.role || 'custom');
  const [agentType, setAgentType] = useState<AgentType>(agent?.agentType || 'workspace');
  const [description, setDescription] = useState(agent?.description || '');
  const [provider, setProvider] = useState(agent?.provider ?? '');
  const [model, setModel] = useState(agent?.model ?? '');
  const [teamId, setTeamId] = useState(agent?.teamId || '');
  const [color, setColor] = useState(agent?.color || '#6b7280');
  const [capStr, setCapStr] = useState((agent?.capabilities || []).join(', '));
  const [registrySource, setRegistrySource] = useState('');
  const [registryVersion, setRegistryVersion] = useState('');
  const [runtimeProviders, setRuntimeProviders] = useState<ProviderOption[]>([]);
  const [configProviders, setConfigProviders] = useState<ProviderOption[]>([]);
  const [runtimeAgents, setRuntimeAgents] = useState<Array<{ name: string; description?: string }>>([]);
  const [runtimeAgent, setRuntimeAgent] = useState(agent?.runtimeAgent ?? '');
  const [providersLoading, setProvidersLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const defaultsApplied = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [runtimeRes, configRes, agentsRes] = await Promise.all([
        fetchJSON<{ providers: Array<{ id: string; name?: string; models?: string[] }> }>('/api/opencode/providers'),
        fetchJSON<{ providers: ProviderOption[] }>('/api/providers'),
        fetchJSON<{ agents: Array<{ name: string; description?: string }> }>('/api/opencode/agents'),
      ]);
      if (cancelled) return;
      const runtime = (runtimeRes?.providers ?? []).map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        enabled: true,
        status: 'available',
        models: (p.models ?? []).map((modelId) => ({ id: modelId, name: modelId, enabled: true })),
      }));
      setRuntimeProviders(runtime);
      setConfigProviders(configRes?.providers ?? []);
      setRuntimeAgents(agentsRes?.agents ?? []);
      setProvidersLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const providers = agentType === 'workspace' && runtimeProviders.length > 0 ? runtimeProviders : configProviders;
  const providerSource = agentType === 'workspace' && runtimeProviders.length > 0 ? 'runtime' : 'config';

  const applyWorkspaceDefaults = useCallback(() => {
    if (agent?.provider !== undefined || agent?.model !== undefined || agent?.runtimeAgent !== undefined) {
      if (agent.provider !== undefined) setProvider(agent.provider);
      if (agent.model !== undefined) setModel(agent.model);
      if (agent.runtimeAgent !== undefined) setRuntimeAgent(agent.runtimeAgent);
      return;
    }
    const first = runtimeProviders.find((p) => p.enabled) ?? runtimeProviders[0];
    if (first) {
      setProvider(first.id);
      const firstModel = first.models.find((m) => m.enabled) ?? first.models[0];
      setModel(firstModel?.id ?? '');
    }
    const build = runtimeAgents.find((a) => a.name === 'build');
    setRuntimeAgent(build?.name ?? runtimeAgents[0]?.name ?? 'build');
  }, [agent, runtimeProviders, runtimeAgents]);

  useEffect(() => {
    if (agentType !== 'workspace') return;
    if (defaultsApplied.current) return;
    if (providersLoading) return;
    if (agent?.provider !== undefined || agent?.model !== undefined || agent?.runtimeAgent !== undefined) {
      defaultsApplied.current = true;
      applyWorkspaceDefaults();
      return;
    }
    if (runtimeProviders.length === 0 && runtimeAgents.length === 0) return;
    defaultsApplied.current = true;
    applyWorkspaceDefaults();
  }, [agentType, providersLoading, runtimeProviders, runtimeAgents, agent, applyWorkspaceDefaults]);

  useEffect(() => {
    let cancelled = false;
    void fetchJSON<RoutingSelectionResponse>('/api/routing/selection').then((routingRes) => {
      if (cancelled) return;
      const global = routingRes?.selection?.roles?.developer;
      if (global?.providerId && global?.modelId && !agent?.provider && !agent?.model) {
        setProvider(global.providerId);
        setModel(global.modelId);
      }
    });
    return () => { cancelled = true; };
  }, [agent]);

  const providerModels = providers.find((p) => p.id === provider)?.models ?? [];
  const modelOptions = useMemo(() => {
    const options: Array<{ id: string; name: string; enabled: boolean; isCustom?: boolean }> = providerModels.map(
      (m) => ({ id: m.id, name: m.name, enabled: m.enabled }),
    );
    if (model && !options.some((o) => o.id === model))
      options.unshift({ id: model, name: model, enabled: true, isCustom: true });
    return options;
  }, [providerModels, model]);

  const handleProviderChange = (id: string) => {
    setProvider(id);
    const models = providers.find((p) => p.id === id)?.models ?? [];
    const first = models.find((m) => m.enabled) ?? models[0];
    setModel(first?.id ?? '');
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!role.trim()) errs.role = 'Role is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      name,
      role,
      agentType,
      description,
      provider: agentType === 'workspace' ? (provider || undefined) : (registrySource || undefined),
      model: agentType === 'workspace' ? (model || undefined) : (registryVersion || undefined),
      runtimeAgent: agentType === 'workspace' ? runtimeAgent || undefined : undefined,
      teamId: teamId || '',
      color,
      capabilities: capStr.split(',').map((s) => s.trim()).filter(Boolean),
    });
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validate();
  };

  const canProceedStep1 = name.trim().length > 0;

  return (
    <VestaraModal onClose={onClose} className="max-w-2xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-(--vestara-text)">
              {isNewRegistration ? 'Register Agent' : 'Edit Agent'}
            </h2>
            <p className="text-[10px] text-(--vestara-text-muted) mt-0.5">
              Step {step} of 2 — {step === 1 ? 'Basic Info' : 'Advanced Config'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) text-base cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                  step >= s
                    ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                    : 'bg-(--vestara-accent-bg) text-(--vestara-text-dim) border border-(--vestara-accent-border)'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
              <span className={`text-[10px] ${step >= s ? 'text-(--vestara-text-2)' : 'text-(--vestara-text-dim)'}`}>
                {s === 1 ? 'Basic Info' : 'Advanced'}
              </span>
              {s < 2 && (
                <div className={`flex-1 h-px ${step > 1 ? 'bg-amber-400/40' : 'bg-(--vestara-accent-border)'}`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Name <span className="text-red-400">*</span></label>
                  <input
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: '' })); }}
                    onBlur={() => handleBlur('name')}
                    required
                    placeholder="Agent name"
                    className={`${inputClass} ${errors.name && touched.name ? 'border-red-400' : ''}`}
                  />
                  {errors.name && touched.name && (
                    <p className="text-[10px] text-red-400 mt-1">{errors.name}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Role <span className="text-red-400">*</span></label>
                  <select
                    value={role}
                    onChange={(e) => { setRole(e.target.value); if (errors.role) setErrors((p) => ({ ...p, role: '' })); }}
                    onBlur={() => handleBlur('role')}
                    className={`${inputClass} cursor-pointer ${errors.role && touched.role ? 'border-red-400' : ''}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {errors.role && touched.role && (
                    <p className="text-[10px] text-red-400 mt-1">{errors.role}</p>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Agent Type</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="agentType"
                      value="workspace"
                      checked={agentType === 'workspace'}
                      onChange={() => setAgentType('workspace')}
                      className="w-4 h-4 text-(--vestara-accent-text) bg-(--vestara-accent-bg) border-(--vestara-accent-border) focus:ring-(--vestara-accent-border-active)"
                    />
                    <span className="text-xs text-(--vestara-text-2)">Workspace Agent</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="agentType"
                      value="registry"
                      checked={agentType === 'registry'}
                      onChange={() => setAgentType('registry')}
                      className="w-4 h-4 text-(--vestara-accent-text) bg-(--vestara-accent-bg) border-(--vestara-accent-border) focus:ring-(--vestara-accent-border-active)"
                    />
                    <span className="text-xs text-(--vestara-text-2)">Registry Agent</span>
                  </label>
                </div>
                <p className="text-[10px] text-(--vestara-text-muted) mt-1">
                  {agentType === 'workspace'
                    ? 'Local agent configured in this workspace'
                    : 'Agent installed from the marketplace registry'}
                </p>
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this agent does..."
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Team</label>
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-8 h-8 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg cursor-pointer shrink-0"
                    />
                    <input
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className={`${inputClass} flex-1 font-mono`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Advanced Config */}
          {step === 2 && (
            <div className="space-y-3">
              {agentType === 'workspace' ? (
                <>
                  <div>
                    <label className={labelClass}>
                      Runtime Agent <span className="normal-case font-normal text-(--vestara-accent-text)">(OpenCode runtime)</span>
                    </label>
                    <select
                      value={runtimeAgent}
                      onChange={(e) => setRuntimeAgent(e.target.value)}
                      className={`${inputClass} cursor-pointer`}
                    >
                      {runtimeAgents.length === 0 && <option value="">No runtime agents discovered</option>}
                      {runtimeAgent && !runtimeAgents.some((a) => a.name === runtimeAgent) && (
                        <option value={runtimeAgent}>{runtimeAgent} (current)</option>
                      )}
                      {runtimeAgents.map((a) => (
                        <option key={a.name} value={a.name}>
                          {a.name}{a.description ? ` — ${a.description}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-(--vestara-text-muted) mt-1">
                      The native agent from the OpenCode runtime this agent runs as.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>
                        Provider {providerSource === 'runtime' && <span className="normal-case font-normal text-(--vestara-accent-text)">(runtime)</span>}
                      </label>
                      {providersLoading ? (
                        <div className={`${inputClass} flex items-center text-(--vestara-text-dim)`}>Loading providers…</div>
                      ) : (
                        <select
                          value={provider}
                          onChange={(e) => handleProviderChange(e.target.value)}
                          className={`${inputClass} cursor-pointer`}
                          disabled={providers.length === 0}
                        >
                          {providers.length === 0 && <option value="">No providers configured</option>}
                          {agent?.provider && !providers.some((p) => p.id === agent.provider) && (
                            <option value={agent.provider}>{agent.provider} (current)</option>
                          )}
                          {providers.map((p) => (
                            <option key={p.id} value={p.id} disabled={!p.enabled && p.id !== provider}>
                              {p.name} ({p.id}){!p.enabled ? ' — disabled' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>
                        Model {providerSource === 'runtime' && <span className="normal-case font-normal text-(--vestara-accent-text)">(runtime)</span>}
                      </label>
                      {providersLoading ? (
                        <div className={`${inputClass} flex items-center text-(--vestara-text-dim)`}>Loading models…</div>
                      ) : modelOptions.length > 0 ? (
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className={`${inputClass} cursor-pointer`}
                        >
                          {modelOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}{!m.enabled ? ' (disabled)' : ''}{m.isCustom ? ' (current)' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          placeholder={provider ? `No models for ${provider} — enter model id` : 'Model id'}
                          className={inputClass}
                        />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Registry Source</label>
                    <input
                      value={registrySource}
                      onChange={(e) => setRegistrySource(e.target.value)}
                      placeholder="e.g. @vestara/agent-pack"
                      className={inputClass}
                    />
                    <p className="text-[10px] text-(--vestara-text-muted) mt-1">
                      Marketplace package or registry identifier
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Version</label>
                    <input
                      value={registryVersion}
                      onChange={(e) => setRegistryVersion(e.target.value)}
                      placeholder="e.g. ^1.0.0"
                      className={inputClass}
                    />
                    <p className="text-[10px] text-(--vestara-text-muted) mt-1">
                      Semantic version constraint
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className={labelClass}>Capabilities (comma-separated)</label>
                <input
                  value={capStr}
                  onChange={(e) => setCapStr(e.target.value)}
                  placeholder="e.g. code-generation, refactoring, testing"
                  className={inputClass}
                />
                {capStr.trim() && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {capStr.split(',').map((s) => s.trim()).filter(Boolean).map((c) => (
                      <span
                        key={c}
                        className="text-[8px] px-1.5 py-0.5 bg-(--vestara-accent-bg) text-(--vestara-text-2) rounded border border-(--vestara-accent-border)/50"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-2 pt-4 mt-4 border-t border-(--vestara-accent-border)">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
              >
                Back
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="text-xs px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                className="flex-1 text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-accent-text) rounded-lg hover:bg-(--vestara-accent-border)/20 transition-colors cursor-pointer font-medium"
              >
                {isNewRegistration ? 'Register Agent' : 'Save Changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </VestaraModal>
  );
}
