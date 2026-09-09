/**
 * AgentProjectionDrawer — contextual Agent Control drawer for M11C (AR-AGENT-CTRL-003).
 *
 * Premium tabbed drawer with four tabs:
 * - Overview: agent identity, role/category, status, team, projected-state summary
 * - Configuration: editable canonical fields with draft state and update flow
 * - Capabilities: configured authority (capabilities, permissions) — read-only
 * - Activity: projected presence, work state, membership, assignment
 *
 * Uses canonical GET /api/agents/:id and PUT /api/agents/:id.
 * Activity Room projected state ≠ canonical Agent configuration.
 *
 * AR-AGENT-CTRL-003 changes:
 * - Drawer size menu (⋮) replaces exposed Normal/Medium/Large/Full buttons
 * - Reusable form primitives (FormField, TextInput, TextArea, Select, MultiSelect)
 * - Role uses Authoritative AgentRole type from @vestara/workspace
 * - Capabilities uses MultiSelect with removable token chips
 * - Permissions rendered semantically from structured fields
 * - Tab components extracted for reduced responsibility
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { Tabs } from '../../components/ui/Tabs';
import { AgentStatusBadge } from '../../components/ui/agents/AgentStatusBadge';
import { deriveCategory, CATEGORY_ICONS, CATEGORY_COLORS } from '../../components/ui/agents/deriveCategory';
import { getAgentColor } from '../../components/ui/agents/agentColors';
import { ProviderModelPicker } from '../../components/ui/agents/ProviderModelPicker';
import { buttonPrimaryClass, buttonSecondaryClass } from '../../components/ui/agents/formClasses';
import { FormField, TextInput, TextArea, Select, MultiSelect } from '../../components/ui/forms';
import type { ParticipantProjection } from '@vestara/activity-room';
import type { TeamRef } from '../../components/ui/agents/types';
import { WorkTab } from './WorkTab';

// ─── Types ───────────────────────────────────────────────────

interface AgentProjectionDrawerProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  participant: ParticipantProjection;
}

interface CanonicalAgent {
  id: string;
  name: string;
  role: string;
  description?: string;
  status: string;
  provider?: string;
  model?: string;
  runtimeAgent?: string;
  teamId?: string;
  capabilities: string[];
  permissions: any[];
  color?: string;
}

interface CanonicalTeam {
  id: string;
  name: string;
}

interface DraftState {
  name: string;
  role: string;
  description: string;
  provider: string;
  model: string;
  runtimeAgent: string;
  capabilities: string[];
  color: string;
  teamId: string;
}

// ─── Authoritative Role Vocabulary ───────────────────────────
// Values from packages/workspace/src/types.ts — AgentRole union type.
// This is the canonical role source. Do NOT hardcode a subset here.
// NOTE: Type import blocked by dependency boundary; values are string literals
// from the authoritative AgentRole union.

const ALL_ROLES = [
  'architect', 'developer', 'verifier', 'documenter', 'security', 'devops',
  'testing', 'ux', 'performance', 'database', 'release', 'governance',
  'conversation', 'planning', 'refactoring', 'custom', 'dashboard-curator',
  'frontend', 'analyst', 'reviewer', 'tester', 'continuous-tester',
  'security-agent', 'performance-agent', 'documentation-agent',
  'refactoring-agent', 'release-agent', 'context',
] as const;

const ROLE_OPTIONS = ALL_ROLES.map((r) => ({ value: r, label: r }));

// ─── Compatibility Layer ─────────────────────────────────────

export function resolveAgentIdFromParticipantId(participantId: string): string | null {
  if (participantId.startsWith('agent-')) {
    return participantId.slice('agent-'.length);
  }
  return null;
}

// ─── Fetch Helpers ───────────────────────────────────────────

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function agentToDraft(agent: CanonicalAgent): DraftState {
  return {
    name: agent.name,
    role: agent.role,
    description: agent.description ?? '',
    provider: agent.provider ?? '',
    model: agent.model ?? '',
    runtimeAgent: agent.runtimeAgent ?? '',
    capabilities: agent.capabilities ?? [],
    color: agent.color ?? '#6b7280',
    teamId: agent.teamId ?? '',
  };
}

function draftToPayload(draft: DraftState) {
  return {
    name: draft.name.trim(),
    role: draft.role.trim(),
    description: draft.description.trim() || undefined,
    provider: draft.provider || undefined,
    model: draft.model || undefined,
    runtimeAgent: draft.runtimeAgent || undefined,
    capabilities: draft.capabilities,
    color: draft.color || undefined,
    teamId: draft.teamId || undefined,
  };
}

function isDraftDirty(draft: DraftState, original: CanonicalAgent): boolean {
  return (
    draft.name.trim() !== original.name ||
    draft.role.trim() !== (original.role ?? '') ||
    draft.description.trim() !== (original.description ?? '') ||
    draft.provider !== (original.provider ?? '') ||
    draft.model !== (original.model ?? '') ||
    draft.runtimeAgent !== (original.runtimeAgent ?? '') ||
    JSON.stringify(draft.capabilities) !== JSON.stringify(original.capabilities ?? []) ||
    draft.color !== (original.color ?? '#6b7280') ||
    draft.teamId !== (original.teamId ?? '')
  );
}

// ─── Permission Rendering ────────────────────────────────────

function formatPermission(perm: any): string {
  const resource = String(perm.resource ?? '').replace(/-/g, ' ');
  const action = String(perm.action ?? '').replace(/-/g, ' ');
  const approval = perm.approvalRequired ? 'Ask' : 'Allow';
  return `${capitalize(resource)} ${capitalize(action)} ${approval}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Layout Constants ────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
  { id: 'work', label: 'Work', shortLabel: 'Work' },
  { id: 'configuration', label: 'Configuration', shortLabel: 'Config' },
  { id: 'capabilities', label: 'Capabilities', shortLabel: 'Caps' },
  { id: 'activity', label: 'Activity', shortLabel: 'Activity' },
] as const;

const SIZE_ACTIONS = [
  { id: 'normal', label: 'Normal' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'full', label: 'Full' },
];

// ─── Tab Components ──────────────────────────────────────────

function OverviewTab({ agent, team, participant, loading, error, agentColor, category }: {
  agent: CanonicalAgent | null;
  team: CanonicalTeam | null;
  participant: ParticipantProjection;
  loading: boolean;
  error: string | undefined;
  agentColor: string;
  category: string;
}) {
  if (loading) {
    return <div className="py-8 text-center text-[10px] text-(--vestara-text-muted)">Loading agent configuration…</div>;
  }
  if (error) {
    return <p className="rounded-lg border border-(--vestara-red-border) bg-(--vestara-red-bg) px-3 py-2 text-[10px] text-(--vestara-red)" role="alert">{error}</p>;
  }
  if (!agent) {
    return (
      <p className="rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)">
        Agent not registered in the Agent Registry.
      </p>
    );
  }

  const categoryIcon = CATEGORY_ICONS[category] ?? '★';
  const categoryColor = CATEGORY_COLORS[category] ?? '#6b7280';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: agentColor }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-(--vestara-text)">{agent.name}</h3>
              <AgentStatusBadge status={agent.status} size="md" />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-(--vestara-text-muted)">
              <span style={{ color: categoryColor }}>{categoryIcon}</span>
              <span>{agent.role}</span>
              <span className="text-(--vestara-text-dim)">·</span>
              <span>{category}</span>
            </div>
          </div>
        </div>
        {agent.description && (
          <p className="mt-3 text-[10px] leading-relaxed text-(--vestara-text-2)">{agent.description}</p>
        )}
      </div>

      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
        <div className="mb-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Identity</div>
        <div className="space-y-1">
          <InfoRow label="Agent ID" value={agent.id} />
          {team && <InfoRow label="Team" value={team.name} />}
          {agent.runtimeAgent && <InfoRow label="Runtime Agent" value={agent.runtimeAgent} />}
          {agent.provider && <InfoRow label="Provider" value={agent.provider} />}
          {agent.model && <InfoRow label="Model" value={agent.model} />}
        </div>
      </div>

      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
        <div className="mb-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Projected State</div>
        <div className="space-y-1">
          <InfoRow label="Presence" value={participant.presence} />
          <InfoRow label="Work State" value={participant.workState} />
          {participant.currentAssignment && (
            <InfoRow label="Assignment" value={participant.currentAssignment.taskTitle ?? participant.currentAssignment.taskId} />
          )}
        </div>
      </div>

      {agent.capabilities && agent.capabilities.length > 0 && (
        <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
          <div className="mb-2 text-[9px] uppercase tracking-widest text(--vestara-text-dim)">Capabilities</div>
          <div className="flex flex-wrap gap-1">
            {agent.capabilities.map((cap) => (
              <span key={cap} className="rounded border border-(--vestara-accent-border) px-1.5 py-0.5 text-[9px] text-(--vestara-text-2)">
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigurationTab({ agent, teams, draft, updateDraft, validationErrors, saveError, loading, error }: {
  agent: CanonicalAgent | null;
  teams: TeamRef[];
  draft: DraftState;
  updateDraft: (field: keyof DraftState, value: any) => void;
  validationErrors: Record<string, string>;
  saveError: string | undefined;
  loading: boolean;
  error: string | undefined;
}) {
  if (loading) {
    return <div className="py-8 text-center text-[10px] text-(--vestara-text-muted)">Loading…</div>;
  }
  if (error || !agent) {
    return <div className="py-8 text-center text-[10px] text-(--vestara-text-muted)">No agent data available.</div>;
  }

  return (
    <div className="space-y-3 p-1">
      {saveError && (
        <div className="rounded-lg border border-(--vestara-red-border) bg-(--vestara-red-bg) px-3 py-2 text-[10px] text-(--vestara-red)" role="alert">
          {saveError}
        </div>
      )}

      <FormField label="Name" htmlFor="drawer-agent-name" required error={validationErrors.name}>
        <TextInput
          id="drawer-agent-name"
          value={draft.name}
          onChange={(e) => updateDraft('name', e.target.value)}
          placeholder="Agent name"
          error={!!validationErrors.name}
        />
      </FormField>

      <FormField label="Role" htmlFor="drawer-agent-role" required error={validationErrors.role}>
        <Select
          id="drawer-agent-role"
          options={ROLE_OPTIONS}
          value={draft.role}
          onChange={(e) => updateDraft('role', e.target.value)}
          placeholder="Select role"
          error={!!validationErrors.role}
        />
      </FormField>

      <FormField label="Description" htmlFor="drawer-agent-desc">
        <TextArea
          id="drawer-agent-desc"
          value={draft.description}
          onChange={(e) => updateDraft('description', e.target.value)}
          placeholder="What does this agent do?"
          rows={2}
        />
      </FormField>

      <FormField label="Provider / Model">
        <ProviderModelPicker
          providerId={draft.provider}
          modelId={draft.model}
          onChange={(p, m) => {
            updateDraft('provider', p);
            updateDraft('model', m);
          }}
        />
      </FormField>

      <FormField label="Runtime Agent" htmlFor="drawer-agent-runtime">
        <TextInput
          id="drawer-agent-runtime"
          value={draft.runtimeAgent}
          onChange={(e) => updateDraft('runtimeAgent', e.target.value)}
          placeholder="e.g. vestara-developer"
        />
      </FormField>

      <FormField label="Color" htmlFor="drawer-agent-color">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => updateDraft('color', e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-(--vestara-accent-border)"
          />
          <TextInput
            id="drawer-agent-color"
            value={draft.color}
            onChange={(e) => updateDraft('color', e.target.value)}
            className="flex-1"
          />
        </div>
      </FormField>

      {teams.length > 0 && (
        <FormField label="Team" htmlFor="drawer-agent-team">
          <Select
            id="drawer-agent-team"
            options={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
            value={draft.teamId}
            onChange={(e) => updateDraft('teamId', e.target.value)}
          />
        </FormField>
      )}
    </div>
  );
}

function CapabilitiesTab({ agent, capabilities, updateCapabilities, loading, error }: {
  agent: CanonicalAgent | null;
  capabilities: string[];
  updateCapabilities: (caps: string[]) => void;
  loading: boolean;
  error: string | undefined;
}) {
  if (loading) {
    return <div className="py-8 text-center text-[10px] text-(--vestara-text-muted)">Loading…</div>;
  }
  if (error || !agent) {
    return <div className="py-8 text-center text-[10px] text-(--vestara-text-muted)">No agent data available.</div>;
  }

  const hasPermissions = agent.permissions && agent.permissions.length > 0;

  // ARCHITECTURAL GAP: No authoritative capability registry/API exists.
  // The AgentCapability type in packages/workspace/src/types.ts has (string & {})
  // escape hatch making it effectively unbounded. CAPABILITY_DESCRIPTIONS in
  // agent-service.ts covers 35 entries but misses 8+ capabilities used by
  // canonical agents (context-reading, question-answering, web-navigation, etc.).
  // For now, we derive options from the existing capabilities on the agent
  // plus a curated set from the type union. This should be replaced with
  // GET /api/capabilities once it returns a complete, authoritative list.
  const CAPABILITY_OPTIONS = [
    ...new Set([
      ...capabilities,
      'architecture-analysis', 'design-review', 'dependency-analysis',
      'code-generation', 'refactoring', 'bug-fixing', 'testing', 'diagnostics',
      'quality-analysis', 'documentation', 'summarization', 'knowledge-management',
      'security-analysis', 'devops-automation', 'performance-optimization',
      'database-design', 'release-management', 'ux-design', 'conversation',
      'prompt-engineering', 'web-navigation', 'web-observation', 'web-interaction',
      'web-research', 'context-reading', 'question-answering', 'repository-read',
      'search-files', 'read-files', 'write-files', 'run-commands', 'git-status', 'git-diff',
    ]),
  ].sort().map((c) => ({ value: c, label: c }));

  return (
    <div className="space-y-4 p-1">
      <div className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[10px] text-(--vestara-text-muted)">
        Configured authority — the capabilities and permissions assigned to this agent in the Agent Registry.
        This does not reflect effective runtime authority.
      </div>

      <FormField label="Configured Capabilities" help="Searchable multi-select. Type to filter.">
        <MultiSelect
          options={CAPABILITY_OPTIONS}
          value={capabilities}
          onChange={updateCapabilities}
          placeholder="Add capabilities…"
          searchPlaceholder="Search capabilities…"
        />
      </FormField>

      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
        <div className="mb-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Configured Permissions</div>
        {hasPermissions ? (
          <div className="space-y-1">
            {agent.permissions.map((perm: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                <span className="text-(--vestara-text-2)">{formatPermission(perm)}</span>
                {perm.approvalRequired ? (
                  <span className="text-[8px] rounded bg-(--vestara-amber-bg) border border-(--vestara-amber-border) px-1 py-0.5 text-(--vestara-amber)">Ask</span>
                ) : (
                  <span className="text-[8px] rounded bg-green-400/10 border border-green-400/30 px-1 py-0.5 text-green-400">Allow</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-(--vestara-text-muted)">No permissions configured.</p>
        )}
      </div>

      <div className="rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)">
        Effective runtime authority is determined by the execution environment and may differ from configured authority.
        Runtime authority data is not currently available from an authoritative API.
      </div>
    </div>
  );
}

function ActivityTab({ participant }: { participant: ParticipantProjection }) {
  return (
    <div className="space-y-4 p-1">
      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
        <div className="mb-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Projected Presence</div>
        <div className="space-y-1">
          <InfoRow label="Presence" value={participant.presence} />
          <InfoRow label="Work State" value={participant.workState} />
          <InfoRow label="Membership" value={participant.membership} />
          {participant.role && <InfoRow label="Role (Projected)" value={participant.role} />}
          {participant.modelId && <InfoRow label="Model (Projected)" value={participant.modelId} />}
          {participant.providerId && <InfoRow label="Provider (Projected)" value={participant.providerId} />}
          {participant.teamName && <InfoRow label="Team (Projected)" value={participant.teamName} />}
        </div>
      </div>

      {participant.currentAssignment && (
        <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
          <div className="mb-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Current Assignment</div>
          <div className="space-y-1">
            <InfoRow label="Task" value={participant.currentAssignment.taskTitle ?? participant.currentAssignment.taskId} />
            <InfoRow label="Workflow Run" value={participant.currentAssignment.workflowRunId} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
        <div className="mb-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Activity</div>
        <div className="space-y-1">
          <InfoRow label="Last Activity" value={participant.lastActivityAt} />
          <InfoRow label="Joined" value={participant.joinedAt} />
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function AgentProjectionDrawer({
  open,
  onClose,
  agentId,
  participant,
}: AgentProjectionDrawerProps) {
  // Canonical data
  const [agent, setAgent] = useState<CanonicalAgent | null>(null);
  const [team, setTeam] = useState<CanonicalTeam | null>(null);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Draft state
  const [draft, setDraft] = useState<DraftState>({
    name: '', role: '', description: '', provider: '', model: '',
    runtimeAgent: '', capabilities: [], color: '#6b7280', teamId: '',
  });
  const originalRef = useRef<CanonicalAgent | null>(null);
  const [dirty, setDirty] = useState(false);

  // Update flow
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close-guard
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const pendingCloseRef = useRef(false);

  // Drawer size (persisted via Drawer's storageKey)
  const [drawerSize, setDrawerSize] = useState<string>('normal');

  // Load canonical agent data
  const load = useCallback(async () => {
    if (!open || !agentId) return;
    setLoading(true);
    setError(undefined);
    setAgent(null);
    setTeam(null);
    setDirty(false);
    setSaveError(undefined);
    setSaveSuccess(false);
    setActiveTab('overview');

    const [agentRes, teamsRes] = await Promise.all([
      fetchJSON<{ agent: CanonicalAgent | null; team: CanonicalTeam | null }>(
        `/api/agents/${encodeURIComponent(agentId)}`,
      ),
      fetchJSON<{ teams: TeamRef[] }>('/api/teams').catch(() => ({ teams: [] })),
    ]);

    if (agentRes) {
      setAgent(agentRes.agent ?? null);
      setTeam(agentRes.team ?? null);
      setTeams(teamsRes?.teams ?? []);
      if (agentRes.agent) {
        const d = agentToDraft(agentRes.agent);
        setDraft(d);
        originalRef.current = agentRes.agent;
      }
    } else {
      setError('Failed to load agent configuration.');
    }
    setLoading(false);
  }, [open, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Dirty tracking
  useEffect(() => {
    if (originalRef.current) {
      setDirty(isDraftDirty(draft, originalRef.current));
    }
  }, [draft]);

  const displayName = useMemo(
    () => agent?.name ?? participant.displayName,
    [agent, participant],
  );

  const category = useMemo(() => deriveCategory(draft.role || agent?.role || ''), [draft.role, agent]);
  const agentColor = useMemo(
    () => getAgentColor({ color: draft.color || agent?.color, role: draft.role || agent?.role || '' }),
    [draft.color, agent, draft.role],
  );

  // Draft update helpers
  const updateDraft = useCallback((field: keyof DraftState, value: any) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setSaveError(undefined);
    setSaveSuccess(false);
  }, []);

  // Validate draft
  const validationErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = 'Name is required';
    if (!draft.role.trim()) e.role = 'Role is required';
    return e;
  }, [draft.name, draft.role]);

  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  // Save handler
  const handleSave = useCallback(async () => {
    if (!agent || !dirty || hasValidationErrors || saving) return;

    setSaving(true);
    setSaveError(undefined);
    setSaveSuccess(false);

    try {
      const payload = draftToPayload(draft);
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Update failed (${res.status})`);
      }

      const { agent: updated } = (await res.json()) as { agent: CanonicalAgent };
      setAgent(updated);
      originalRef.current = updated;
      const d = agentToDraft(updated);
      setDraft(d);
      setDirty(false);
      setSaveSuccess(true);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }, [agent, draft, dirty, hasValidationErrors, saving]);

  // Cancel / reset
  const handleReset = useCallback(() => {
    if (originalRef.current) {
      setDraft(agentToDraft(originalRef.current));
      setDirty(false);
      setSaveError(undefined);
      setSaveSuccess(false);
    }
  }, []);

  // Close guard
  const handleClose = useCallback(() => {
    if (dirty) {
      pendingCloseRef.current = true;
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowUnsavedWarning(false);
    pendingCloseRef.current = false;
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  const cancelClose = useCallback(() => {
    setShowUnsavedWarning(false);
    pendingCloseRef.current = false;
  }, []);

  // Drawer size menu
  const sizeActions = useMemo(
    () => SIZE_ACTIONS.map((s) => ({ ...s, checked: s.id === drawerSize })),
    [drawerSize],
  );

  const handleSizeChange = useCallback((id: string) => {
    setDrawerSize(id);
  }, []);

  // ─── Tab content routing ────────────────────────────────────

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab agent={agent} team={team} participant={participant} loading={loading} error={error} agentColor={agentColor} category={category} />;
      case 'work':
        return <WorkTab agentId={agentId} participant={participant} />;
      case 'configuration':
        return <ConfigurationTab agent={agent} teams={teams} draft={draft} updateDraft={updateDraft} validationErrors={validationErrors} saveError={saveError} loading={loading} error={error} />;
      case 'capabilities':
        return <CapabilitiesTab agent={agent} capabilities={draft.capabilities} updateCapabilities={(caps) => updateDraft('capabilities', caps)} loading={loading} error={error} />;
      case 'activity':
        return <ActivityTab participant={participant} />;
      default:
        return null;
    }
  }, [activeTab, loading, error, agent, agentId, team, teams, draft, participant, validationErrors, saveError, agentColor, category, updateDraft]);

  // ─── Footer ─────────────────────────────────────────────────

  const footer = (
    <div className="flex items-center gap-2">
      {dirty && (
        <button type="button" onClick={handleReset} className={buttonSecondaryClass}>
          Reset
        </button>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || hasValidationErrors || saving}
        className={`${buttonPrimaryClass} flex-1`}
      >
        {saving ? 'Updating…' : saveSuccess ? 'Updated' : 'Update Agent'}
      </button>
    </div>
  );

  // ─── Unsaved changes warning ────────────────────────────────

  if (showUnsavedWarning) {
    return (
      <Drawer open={open} onClose={handleClose} title="Unsaved Changes" position="right" defaultSize="normal" storageKey="m11c-agent-control" portal bodyClassName="px-4 py-3">
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="text-sm font-medium text-(--vestara-text)">Discard unsaved changes?</div>
          <p className="text-[10px] text-(--vestara-text-muted)">
            You have unsaved modifications to this agent. If you close without saving, your changes will be lost.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={cancelClose} className={buttonSecondaryClass}>Keep Editing</button>
            <button type="button" onClick={confirmClose} className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-md text-xs font-medium hover:bg-red-500/20 transition-colors cursor-pointer">
              Discard
            </button>
          </div>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={displayName}
      position="right"
      defaultSize={drawerSize as any}
      storageKey="m11c-agent-control"
      portal
      header={
        <div className="flex items-center gap-2">
          {agent && <AgentStatusBadge status={agent.status} size="md" />}
          {dirty && (
            <span className="rounded-full bg-(--vestara-amber-bg) border border-(--vestara-amber-border) px-1.5 py-0.5 text-[8px] text-(--vestara-amber)">
              Unsaved
            </span>
          )}
          <DrawerMenu actions={sizeActions} onSelect={handleSizeChange} />
        </div>
      }
      footer={footer}
      bodyClassName="flex flex-col"
    >
      <Tabs
        tabs={[...TABS]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {tabContent}
        </div>
      </Tabs>
    </Drawer>
  );
}

// ─── Internal Components ─────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[10px] text-(--vestara-text-muted)">{label}</span>
      <span className="break-all text-right text-[10px] text-(--vestara-text-2)">{value}</span>
    </div>
  );
}
