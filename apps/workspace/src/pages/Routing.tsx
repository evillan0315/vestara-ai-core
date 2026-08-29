import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AgentData, getAgents } from '../lib/api.js';
import { VestaraModal } from '../components/ui/VestaraModal';
import {
  type EngineeringAgentRole,
  type ProviderModelRef,
  type RoutingAssignment,
  type RoutingCandidate,
  type RoutingCatalog,
  type RoutingResolution,
  RoutingRevisionConflictError,
  routingClient,
  type VersionedRoutingSelection,
} from '../lib/routing.js';

const roles: readonly EngineeringAgentRole[] = [
  'planner',
  'architect',
  'developer',
  'reviewer',
  'verifier',
  'documentation',
];

const panel =
  'rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))]';
const button =
  'rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-3 py-2 text-sm hover:border-[var(--vestara-accent-border)] disabled:cursor-not-allowed disabled:opacity-50';
const select =
  'w-full rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] px-3 py-2 text-sm';

interface LoadState {
  catalog: RoutingCatalog;
  selection: VersionedRoutingSelection;
  assignments: RoutingAssignment[];
  agents: AgentData[];
}

export default function RoutingPage() {
  const [state, setState] = useState<LoadState | null>(null);
  const [draft, setDraft] = useState<VersionedRoutingSelection['selection'] | null>(null);
  const [preview, setPreview] = useState<RoutingResolution | null>(null);
  const [selectedRole, setSelectedRole] = useState<EngineeringAgentRole>('developer');
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<VersionedRoutingSelection | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catalog, selection, assignments, agents] = await Promise.all([
        routingClient.catalog(),
        routingClient.selection(),
        routingClient.assignments(),
        getAgents(),
      ]);
      setState({ catalog, selection, assignments, agents });
      setDraft(structuredClone(selection.selection));
      setAgentId(agents.find((agent) => agent.role === 'developer')?.id ?? agents[0]?.id ?? 'developer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load engineering routing');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleAgents = useMemo(
    () => state?.agents.filter((agent) => agent.role === selectedRole || agent.role.includes(selectedRole)) ?? [],
    [selectedRole, state],
  );

  const updateProfile = async (profileId: string) => {
    if (!state || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await routingClient.updateSelection({ ...draft, profileId }, state.selection.revision);
      setState({ ...state, selection: updated });
      setDraft(structuredClone(updated.selection));
    } catch (caught) {
      if (caught instanceof RoutingRevisionConflictError) setConflict(caught.current);
      else setError(caught instanceof Error ? caught.message : 'Unable to update routing profile');
    } finally {
      setBusy(false);
    }
  };

  const saveRole = async (role: EngineeringAgentRole, value: string) => {
    if (!state || !draft) return;
    const [providerId, modelId] = value.split('/');
    const next = { ...draft, roles: { ...draft.roles, [role]: { providerId, modelId } } };
    setBusy(true);
    try {
      const updated = await routingClient.updateSelection(next, state.selection.revision);
      setState({ ...state, selection: updated });
      setDraft(structuredClone(updated.selection));
    } catch (caught) {
      if (caught instanceof RoutingRevisionConflictError) setConflict(caught.current);
      else setError(caught instanceof Error ? caught.message : 'Unable to save role routing');
    } finally {
      setBusy(false);
    }
  };

  const previewRoute = async () => {
    if (!draft || !agentId) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await routingClient.preview({ role: selectedRole, agentId, profileId: draft.profileId }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No compatible routing candidate');
    } finally {
      setBusy(false);
    }
  };

  if (error && !state) return <ErrorPanel message={error} retry={() => void load()} />;
  if (!state || !draft)
    return <div className="p-8 text-sm text-[var(--vestara-text-muted)]">Loading engineering routing…</div>;

  return (
    <div className="space-y-6 p-[var(--vestara-spacing-page)] text-[var(--vestara-color-text-primary,var(--vestara-text))]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--vestara-accent-text)]">AI OS</p>
          <h1 className="mt-1 text-2xl font-semibold">Engineering Routing</h1>
          <p className="mt-1 text-sm text-[var(--vestara-text-muted)]">
            Select routing intent; the runtime validates and records the effective assignment.
          </p>
        </div>
        <div className="text-right text-xs text-[var(--vestara-text-muted)]">
          Revision {state.selection.revision}
          <br />
          Updated by {state.selection.updatedByClientId}
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Routing profiles">
        {state.catalog.profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            disabled={busy}
            onClick={() => void updateProfile(profile.id)}
            className={`${panel} p-4 text-left ${draft.profileId === profile.id ? 'border-[var(--vestara-accent-border)] ring-1 ring-[var(--vestara-accent)]' : ''}`}
          >
            <span className="font-semibold">{profile.name}</span>
            <span className="mt-1 block text-sm text-[var(--vestara-text-muted)]">{profile.description}</span>
            <span className="mt-3 block text-xs text-[var(--vestara-text-dim)]">
              {profile.policy.mode} · {profile.policy.constraints.locality} · {profile.policy.constraints.dataPolicy}
            </span>
          </button>
        ))}
      </section>

      <section className={`${panel} overflow-hidden`}>
        <div className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-4">
          <h2 className="font-semibold">Role defaults</h2>
          <p className="text-sm text-[var(--vestara-text-muted)]">Defaults affect future and unassigned work only.</p>
        </div>
        <div className="divide-y divide-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
          {roles.map((role) => (
            <RoleRouteRow
              key={role}
              role={role}
              candidates={state.catalog.candidates}
              value={draft.roles[role]}
              disabled={busy}
              onChange={(value) => void saveRole(role, value)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ProviderHealth candidates={state.catalog.candidates} />
        <div className={`${panel} p-4`}>
          <h2 className="font-semibold">Task preflight</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-xs text-[var(--vestara-text-muted)]">
              Role
              <select
                className={`${select} mt-1`}
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value as EngineeringAgentRole)}
              >
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--vestara-text-muted)]">
              Agent instance
              <select className={`${select} mt-1`} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                {(roleAgents.length ? roleAgents : state.agents).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} · {agent.id}
                  </option>
                ))}
                {!state.agents.length && <option value={agentId}>{agentId}</option>}
              </select>
            </label>
            <button
              type="button"
              className={`${button} w-full`}
              disabled={busy || !agentId}
              onClick={() => void previewRoute()}
            >
              Resolve effective routing
            </button>
          </div>
          {preview && <Preflight resolution={preview} />}
        </div>
      </section>

      <Assignments assignments={state.assignments} />

      {conflict && (
        <ConflictDialog
          current={conflict}
          onReload={() => {
            setConflict(null);
            void load();
          }}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}

function RoleRouteRow({
  role,
  candidates,
  value,
  disabled,
  onChange,
}: {
  role: EngineeringAgentRole;
  candidates: RoutingCandidate[];
  value?: ProviderModelRef;
  disabled: boolean;
  onChange(value: string): void;
}) {
  return (
    <div className="grid gap-2 p-4 md:grid-cols-[10rem_1fr] md:items-center">
      <label htmlFor={`route-${role}`} className="capitalize">
        {role}
      </label>
      <select
        id={`route-${role}`}
        className={select}
        disabled={disabled}
        value={value ? `${value.providerId}/${value.modelId}` : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          Automatic policy resolution
        </option>
        {candidates.map((candidate) => (
          <option
            key={`${candidate.ref.providerId}/${candidate.ref.modelId}`}
            value={`${candidate.ref.providerId}/${candidate.ref.modelId}`}
            disabled={!candidate.availability.available}
          >
            {candidate.providerName} · {candidate.ref.modelId} · {candidate.availability.state}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProviderHealth({ candidates }: { candidates: RoutingCandidate[] }) {
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="p-4">
        <h2 className="font-semibold">Provider suitability</h2>
        <p className="text-sm text-[var(--vestara-text-muted)]">
          Availability dimensions remain distinct from compatibility.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-black/10 text-[var(--vestara-text-muted)]">
            <tr>
              <th className="p-3">Provider/model</th>
              <th>Auth</th>
              <th>Reach</th>
              <th>Allowed</th>
              <th>Capacity</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr
                key={`${candidate.ref.providerId}/${candidate.ref.modelId}`}
                className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]"
              >
                <td className="p-3">
                  <span className="font-medium">{candidate.providerName}</span>
                  <br />
                  <span className="text-[var(--vestara-text-muted)]">{candidate.ref.modelId}</span>
                </td>
                <HealthCell ok={candidate.availability.authenticated} />
                <HealthCell ok={candidate.availability.reachable} />
                <HealthCell ok={candidate.availability.allowed} />
                <HealthCell ok={!candidate.availability.busy} />
                <td className="pr-3">{candidate.availability.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HealthCell({ ok }: { ok: boolean }) {
  return <td className={ok ? 'text-emerald-400' : 'text-amber-400'}>{ok ? 'Yes' : 'No'}</td>;
}

function Preflight({ resolution }: { resolution: RoutingResolution }) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] p-3 text-sm">
      <p className="font-semibold">Effective selection</p>
      <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-1">
        <dt>Agent</dt>
        <dd>{resolution.evidence.selectedAgentId}</dd>
        <dt>Provider</dt>
        <dd>{resolution.selected.providerName}</dd>
        <dt>Model</dt>
        <dd>{resolution.selected.ref.modelId}</dd>
        <dt>Policy</dt>
        <dd>{resolution.evidence.policyId}</dd>
        <dt>Reason</dt>
        <dd>{resolution.evidence.reasonCodes.join(', ')}</dd>
      </dl>
      <p className="mt-2 text-xs text-[var(--vestara-text-muted)]">
        {resolution.evidence.rejectedCandidates.length} candidate(s) rejected with recorded evidence.
      </p>
    </div>
  );
}

function Assignments({ assignments }: { assignments: RoutingAssignment[] }) {
  return (
    <section className={`${panel} p-4`}>
      <h2 className="font-semibold">Active task assignments</h2>
      <p className="text-sm text-[var(--vestara-text-muted)]">Changing defaults does not migrate these assignments.</p>
      <div className="mt-3 space-y-2">
        {assignments.length === 0 ? (
          <p className="text-sm text-[var(--vestara-text-muted)]">No governed assignments.</p>
        ) : (
          assignments.map((assignment) => (
            <div
              key={assignment.taskId}
              className="grid gap-1 rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-3 text-sm md:grid-cols-[1fr_auto]"
            >
              <div>
                <span className="font-medium">{assignment.taskId}</span> · {assignment.agentId} ·{' '}
                {assignment.route.providerId}/{assignment.route.modelId}
              </div>
              <div className="text-[var(--vestara-text-muted)]">
                r{assignment.revision} · {assignment.status}
                {assignment.sideEffectsRecorded ? ' · side effects' : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ConflictDialog({
  current,
  onReload,
  onCancel,
}: {
  current: VersionedRoutingSelection;
  onReload(): void;
  onCancel(): void;
}) {
  return (
    <VestaraModal onClose={onCancel} className="max-w-md">
      <div className="p-5">
        <h2 id="routing-conflict-title" className="font-semibold text-(--vestara-text)">
          Routing changed in Workspace UI or Console
        </h2>
        <p className="mt-2 text-sm text-(--vestara-text-muted)">
          Current revision: {current.revision}, updated by {current.updatedByClientId}. Reload before applying another
          change.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={`${button} text-(--vestara-text-2)`} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`${button} border-[var(--vestara-accent-border)]`} onClick={onReload}>
            Reload current routing
          </button>
        </div>
      </div>
    </VestaraModal>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry(): void }) {
  return (
    <div className="p-8">
      <div role="alert" className={`${panel} p-5`}>
        <h1 className="font-semibold text-red-300">Routing unavailable</h1>
        <p className="mt-2 text-sm text-[var(--vestara-text-muted)]">{message}</p>
        <button type="button" className={`${button} mt-4`} onClick={retry}>
          Retry
        </button>
      </div>
    </div>
  );
}
