/**
 * WorkflowPipeline — compact six-stage execution pipeline.
 *
 * Stage matching is intentionally conservative: timeline steps and agent ids
 * are compared as whole role tokens (never substrings), and empty values never
 * match. This keeps Dashboard/Sessions projections from mislabeling stages
 * when a timeline entry has no step or when a role is embedded in another
 * word.
 */

type StageId = 'workspace' | 'explanation' | 'plan' | 'changeset' | 'verification' | 'evidence';

export type WorkflowStageStatus = 'completed' | 'running' | 'failed' | 'blocked' | 'pending';

export interface WorkflowPipelineTimelineEntry {
  readonly step?: string;
  readonly agentId?: string;
  readonly status?: string;
  readonly timestamp?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface WorkflowPipelineSession {
  readonly goal?: string;
  readonly status?: string;
  readonly timeline?: readonly WorkflowPipelineTimelineEntry[];
  readonly metrics?: {
    readonly completedSteps?: number;
    readonly totalSteps?: number;
  };
}

interface PipelineStage {
  readonly id: StageId;
  readonly label: string;
  readonly icon: string;
  /** Role tokens accepted in either `step` or `agentId`. */
  readonly roles: readonly string[];
}

export const STAGES: readonly PipelineStage[] = [
  { id: 'workspace', label: 'Workspace', icon: '◈', roles: ['workspace', 'repository', 'intake'] },
  {
    id: 'explanation',
    label: 'Explanation',
    icon: '?',
    roles: ['explain', 'explanation', 'analyst', 'analysis', 'context'],
  },
  { id: 'plan', label: 'Plan', icon: '△', roles: ['plan', 'planning', 'planner', 'architect', 'architecture'] },
  {
    id: 'changeset',
    label: 'Change Set',
    icon: '◇',
    roles: [
      'implement',
      'implementation',
      'developer',
      'development',
      'refactoring-agent',
      'changeset',
      'change-set',
      'execution',
    ],
  },
  {
    id: 'verification',
    label: 'Verification',
    icon: '✓',
    roles: ['verify', 'verification', 'verifier', 'tester', 'test', 'review', 'reviewer', 'reviewing'],
  },
  {
    id: 'evidence',
    label: 'Evidence',
    icon: '⟐',
    roles: ['evidence', 'release', 'release-agent', 'documentation', 'documentation-agent', 'final'],
  },
];

const STATUS_COLORS: Readonly<Record<WorkflowStageStatus, string>> = {
  completed: 'var(--vestara-status-success)',
  running: 'var(--vestara-status-info)',
  failed: 'var(--vestara-status-error)',
  blocked: 'var(--vestara-status-warning)',
  pending: 'var(--vestara-border-subtle)',
};

const STATUS_BG: Readonly<Record<WorkflowStageStatus, string>> = {
  completed: 'var(--vestara-status-success-bg)',
  running: 'var(--vestara-status-info-bg)',
  failed: 'var(--vestara-status-error-bg)',
  blocked: 'var(--vestara-status-warning-bg)',
  pending: 'transparent',
};

/** Collapse punctuation to single spaces so whole-token matching is stable. */
function normalizeWords(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeStatus(status: string | undefined): WorkflowStageStatus {
  const key = normalizeWords(status).replaceAll(' ', '-');
  switch (key) {
    case 'completed':
    case 'complete':
    case 'done':
    case 'passed':
    case 'success':
    case 'succeeded':
    case 'approved':
      return 'completed';
    case 'running':
    case 'active':
    case 'in-progress':
    case 'executing':
    case 'started':
      return 'running';
    case 'failed':
    case 'failure':
    case 'error':
    case 'errored':
      return 'failed';
    case 'blocked':
    case 'waiting':
    case 'awaiting-approval':
    case 'awaiting-verification':
    case 'needs-review':
      return 'blocked';
    default:
      return 'pending';
  }
}

/** True only when `role` appears as a complete token in `value`. */
function matchesRole(value: string | undefined, role: string): boolean {
  const haystack = normalizeWords(value);
  const needle = normalizeWords(role);
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Timeline entries are append-ordered, so the last matching entry is the most
 * recent observation for that stage. Retries therefore resolve to their latest
 * state instead of the first attempt.
 */
function findStageEntry(
  stage: PipelineStage,
  timeline: readonly WorkflowPipelineTimelineEntry[],
): WorkflowPipelineTimelineEntry | undefined {
  let latest: WorkflowPipelineTimelineEntry | undefined;
  for (const entry of timeline) {
    const matches = stage.roles.some(
      (role) => matchesRole(entry.step, role) || matchesRole(entry.agentId, role),
    );
    if (matches) latest = entry;
  }
  return latest;
}

/**
 * Resolve a stage status from the timeline.
 *
 * Explicit stage entries win. Unmatched stages before the furthest matched
 * stage are inferred complete; stages after it are pending. No timeline data
 * yields pending, never a guessed completion.
 */
export function matchStageStatus(
  stageId: string,
  session: WorkflowPipelineSession | null | undefined,
): WorkflowStageStatus {
  const stageIndex = STAGES.findIndex((stage) => stage.id === stageId);
  if (stageIndex === -1) return 'pending';

  const timeline = session?.timeline ?? [];
  let highestMatchedIndex = -1;
  let explicitStatus: WorkflowStageStatus | null = null;

  for (const [index, stage] of STAGES.entries()) {
    const entry = findStageEntry(stage, timeline);
    if (!entry) continue;
    highestMatchedIndex = Math.max(highestMatchedIndex, index);
    if (index === stageIndex) {
      explicitStatus = normalizeStatus(entry.status);
    }
  }

  if (explicitStatus !== null) return explicitStatus;
  return stageIndex < highestMatchedIndex ? 'completed' : 'pending';
}

function asPipelineSession(value: unknown): WorkflowPipelineSession | null {
  return value !== null && typeof value === 'object' ? (value as WorkflowPipelineSession) : null;
}

export default function WorkflowPipeline({ session, compact }: { session?: unknown; compact?: boolean }) {
  const pipelineSession = asPipelineSession(session);
  if (!pipelineSession) return null;

  const stepCount =
    pipelineSession.metrics?.completedSteps !== undefined && pipelineSession.metrics?.totalSteps !== undefined
      ? `${pipelineSession.metrics.completedSteps}/${pipelineSession.metrics.totalSteps}`
      : '';

  return (
    <div className={`bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg ${compact ? 'p-2' : 'p-3'} mb-4`}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[10px] text-zinc-600 min-w-0">
            {pipelineSession.goal && (
              <span className="text-zinc-300 font-medium text-xs truncate">{pipelineSession.goal}</span>
            )}
            {pipelineSession.status && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold shrink-0 ${
                  pipelineSession.status === 'completed'
                    ? 'bg-green-400/10 text-green-400'
                    : pipelineSession.status === 'running'
                      ? 'bg-blue-400/10 text-blue-400 animate-pulse'
                      : pipelineSession.status === 'failed'
                        ? 'bg-red-400/10 text-red-400'
                        : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {pipelineSession.status}
              </span>
            )}
          </div>
          {stepCount && <div className="text-[9px] text-zinc-700 shrink-0">{stepCount} steps</div>}
        </div>
      )}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const status = matchStageStatus(stage.id, pipelineSession);
          const color = STATUS_COLORS[status];
          const bg = STATUS_BG[status];
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div
                className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] transition-all flex-1 justify-center"
                style={{
                  backgroundColor: bg,
                  border: `1px solid ${status === 'pending' ? 'var(--vestara-border-subtle)' : color}`,
                }}
              >
                <span style={{ color }}>{stage.icon}</span>
                {!compact && (
                  <span
                    className="hidden sm:inline truncate"
                    style={{ color: status === 'pending' ? 'var(--vestara-text-muted)' : color }}
                  >
                    {stage.label}
                  </span>
                )}
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className="w-2 h-px shrink-0"
                  style={{ backgroundColor: status === 'pending' ? 'var(--vestara-border-subtle)' : color }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
