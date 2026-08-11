/**
 * WUX-001C — workflow-scoped trial Activity Room.
 *
 * A two-column human-facing projection over the recorded trial activity:
 * an agent sidebar on the left and the governed activity stream on the right,
 * with advisory messaging controls. It is a projection over persisted activity
 * and is never the authoritative source for workflow state. `?agent=reviewer`
 * filters the stream to one role.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { QualificationTrial } from '../../lib/qualification.js';
import { reconstructTrialActivity } from './trial-activity.js';

export interface TrialActivityRoomProps {
  readonly trial: QualificationTrial;
  readonly agentFilter?: string;
}

const ROLE_COLOR: Record<string, string> = {
  planner: 'bg-violet-500/15 text-violet-300',
  reviewer: 'bg-emerald-500/15 text-emerald-300',
};

export function TrialActivityRoom({ trial, agentFilter }: TrialActivityRoomProps) {
  const steps = useMemo(
    () => reconstructTrialActivity(trial).filter((step) => !agentFilter || step.label.toLowerCase().startsWith(agentFilter.toLowerCase())),
    [trial, agentFilter],
  );
  const roles = ['planner', 'reviewer'];

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-3">
        <div className="text-[10px] uppercase tracking-widest text-(--vestara-text-muted)">Agents</div>
        <ul className="mt-2 space-y-1">
          {roles.map((role) => (
            <li key={role}>
              <Link
                to={role === agentFilter ? `/qualification/${encodeURIComponent(trial.profileId)}/activity` : `/qualification/${encodeURIComponent(trial.profileId)}/activity?agent=${role}`}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${role === agentFilter ? 'bg-white/5' : ''}`}
              >
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${ROLE_COLOR[role] ?? ''}`}>{role}</span>
                <span className="text-(--vestara-text)">{trial.identity.modelId}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-(--vestara-text)">Activity stream</h2>
            {agentFilter && <span className="text-[10px] text-(--vestara-text-muted)">filtered: {agentFilter}</span>}
          </div>
          <ol className="mt-3 space-y-2">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${step.state === 'blocked' ? 'bg-red-500' : step.state === 'active' ? 'bg-sky-500 animate-pulse' : step.state === 'indeterminate' ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="text-(--vestara-text)">{step.label}</span>
                  <span className="ml-1 text-(--vestara-text-muted)">· {step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
          <h2 className="text-xs font-semibold text-(--vestara-text)">Messaging</h2>
          <p className="mt-1 text-[11px] text-(--vestara-text-muted)">
            Advisory — this is a recorded trial; no live agents are connected. Messaging is disabled.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {['Message Planner', 'Message Reviewer', 'Message All Agents'].map((label) => (
              <button key={label} type="button" disabled className="rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-3 py-1.5 text-xs text-(--vestara-text-muted) disabled:cursor-not-allowed disabled:opacity-50">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
