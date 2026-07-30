import { useCallback, useState } from 'react';
import {
  approvePlan,
  implementPlan,
  verifyChangeSet,
  type PlanData,
} from '../../../lib/api';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface PlansSectionProps {
  plans: PlanData[];
  dragSection: DragSectionProps;
  onRefresh: () => void;
}

const STATUS_ORDER = ['draft', 'approved', 'executing', 'completed', 'cancelled'];

const STATUS_ACCENT: Record<string, string> = {
  draft: '#6b7280',
  approved: '#3b82f6',
  executing: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  executing: 'Executing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function PlansSection({ plans, dragSection, onRefresh }: PlansSectionProps) {
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Track generated change sets per plan so we can verify them
  const [changeSets, setChangeSets] = useState<Record<string, { id: string; title: string }>>({});
  // Track verification results per change set
  const [verifications, setVerifications] = useState<Record<string, { id: string; status: string; summary?: any }>>({});

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status] || status,
    accent: STATUS_ACCENT[status] || '#6b7280',
    items: plans.filter((p) => p.status === status),
  }));

  const counts = {
    total: plans.length,
    draft: plans.filter((p) => p.status === 'draft').length,
    approved: plans.filter((p) => p.status === 'approved').length,
    executing: plans.filter((p) => p.status === 'executing').length,
    completed: plans.filter((p) => p.status === 'completed').length,
    totalTasks: plans.reduce((s, p) => s + (p.tasks?.length || 0), 0),
    doneTasks: plans.reduce((s, p) => s + (p.tasks?.filter((t) => t.status === 'completed').length || 0), 0),
  };

  const handleApprove = useCallback(
    async (planId: string) => {
      setActionLoading(`approve-${planId}`);
      setActionError(null);
      try {
        const ok = await approvePlan(planId);
        if (!ok) setActionError(`Failed to approve plan ${planId}`);
        else onRefresh();
      } catch (err: any) {
        setActionError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [onRefresh],
  );

  const handleImplement = useCallback(
    async (planId: string) => {
      setActionLoading(`implement-${planId}`);
      setActionError(null);
      try {
        const result = await implementPlan(planId);
        if (!result || result.error) {
          setActionError(result?.error || `Failed to implement plan ${planId}`);
        } else if (result.changeSet) {
          setChangeSets((prev) => ({
            ...prev,
            [planId]: { id: result.changeSet.id, title: result.changeSet.title || result.changeSet.id },
          }));
        }
        onRefresh();
      } catch (err: any) {
        setActionError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [onRefresh],
  );

  const handleVerify = useCallback(
    async (changeSetId: string) => {
      setActionLoading(`verify-${changeSetId}`);
      setActionError(null);
      try {
        const result = await verifyChangeSet(changeSetId);
        if (!result || result.error) {
          setActionError(result?.error || `Failed to verify change set ${changeSetId}`);
        } else if (result.report) {
          setVerifications((prev) => ({
            ...prev,
            [changeSetId]: {
              id: result.report.id,
              status: result.report.status,
              summary: result.report.summary,
            },
          }));
        }
        onRefresh();
      } catch (err: any) {
        setActionError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [onRefresh],
  );

  return (
    <DashboardSection title="Plans" icon="△" dragSection={dragSection}>
      {/* Stat cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
        <div className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-sm font-bold text-(--vestara-text)">{counts.total}</div>
          <div className="text-[8px] text-(--vestara-text-muted) uppercase tracking-wider">Total</div>
        </div>
        <div className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-sm font-bold text-(--vestara-text-2)">{counts.draft}</div>
          <div className="text-[8px] text-(--vestara-text-muted) uppercase tracking-wider">Draft</div>
        </div>
        <div className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-sm font-bold text-blue-400">{counts.approved}</div>
          <div className="text-[8px] text-(--vestara-text-muted) uppercase tracking-wider">Approved</div>
        </div>
        <div className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-sm font-bold text-amber-400">{counts.executing}</div>
          <div className="text-[8px] text-(--vestara-text-muted) uppercase tracking-wider">Executing</div>
        </div>
        <div className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-sm font-bold text-green-400">{counts.completed}</div>
          <div className="text-[8px] text-(--vestara-text-muted) uppercase tracking-wider">Completed</div>
        </div>
        <div className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-sm font-bold text-(--vestara-text)">
            {counts.doneTasks}/{counts.totalTasks}
          </div>
          <div className="text-[8px] text-(--vestara-text-muted) uppercase tracking-wider">Tasks</div>
        </div>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="mb-3 p-2 bg-red-400/10 border border-red-400/20 rounded-lg text-[10px] text-red-400 flex items-center gap-2">
          <span>⚠</span>
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400/60 hover:text-red-400 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Plan groups by status */}
      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-lg mb-1 opacity-20">△</div>
          <p className="text-[10px] text-(--vestara-text-dim)">No plans yet</p>
          <p className="text-[8px] text-(--vestara-text-dim) mt-1">
            Create a plan with <code className="text-(--vestara-text-2)">plan &lt;goal&gt;</code> in the REPL
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.status}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: group.accent }}
                  />
                  <span className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider font-semibold">
                    {group.label}
                  </span>
                  <span className="text-[8px] text-(--vestara-text-dim)">({group.items.length})</span>
                </div>

                <div className="space-y-1.5">
                  {group.items.slice(0, 5).map((plan) => {
                    const isExpanded = expandedPlan === plan.id;
                    const cs = changeSets[plan.id];
                    const taskTotal = plan.tasks?.length || 0;
                    const taskDone = plan.tasks?.filter((t) => t.status === 'completed').length || 0;
                    const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

                    return (
                      <div key={plan.id}>
                        {/* Plan card */}
                        <div
                          onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                          className="p-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors cursor-pointer border-l-[3px]"
                          style={{ borderLeftColor: group.accent }}
                        >
                          {/* Title row */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] text-(--vestara-text) truncate font-medium flex-1">
                              {plan.title || plan.goal || plan.id}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Action buttons */}
                              {plan.status === 'draft' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApprove(plan.id);
                                  }}
                                  disabled={actionLoading === `approve-${plan.id}`}
                                  className="text-[8px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 transition-colors cursor-pointer disabled:opacity-30 font-medium"
                                >
                                  {actionLoading === `approve-${plan.id}` ? '...' : 'Approve'}
                                </button>
                              )}
                              {plan.status === 'approved' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleImplement(plan.id);
                                  }}
                                  disabled={actionLoading === `implement-${plan.id}`}
                                  className="text-[8px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors cursor-pointer disabled:opacity-30 font-medium"
                                >
                                  {actionLoading === `implement-${plan.id}` ? '...' : 'Implement'}
                                </button>
                              )}
                              <span
                                className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${
                                  plan.status === 'completed'
                                    ? 'bg-green-400/10 text-green-400'
                                    : plan.status === 'executing'
                                      ? 'bg-amber-400/10 text-amber-400'
                                      : plan.status === 'draft'
                                        ? 'bg-zinc-800 text-(--vestara-text-2)'
                                        : plan.status === 'approved'
                                          ? 'bg-blue-400/10 text-blue-400'
                                          : 'bg-zinc-800 text-(--vestara-text-2)'
                                }`}
                              >
                                {plan.status}
                              </span>
                            </div>
                          </div>

                          {/* Meta row */}
                          <div className="flex items-center gap-2 text-[9px] text-(--vestara-text-muted)">
                            <span>{plan.id}</span>
                            {taskTotal > 0 && (
                              <>
                                <span className="text-(--vestara-text-dim)">·</span>
                                <span>
                                  {taskDone}/{taskTotal} tasks
                                </span>
                              </>
                            )}
                            {plan.createdAt && (
                              <>
                                <span className="text-(--vestara-text-dim)">·</span>
                                <span>{new Date(plan.createdAt).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>

                          {/* Task progress bar */}
                          {taskTotal > 0 && (
                            <div className="mt-1.5 w-full bg-(--vestara-accent-bg) rounded-full h-1 overflow-hidden">
                              <div
                                className="h-1 rounded-full transition-all"
                                style={{
                                  width: `${taskPct}%`,
                                  backgroundColor: group.accent,
                                }}
                              />
                            </div>
                          )}

                          {/* Show change set after implementation */}
                          {cs && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[8px] text-cyan-400">◇ Change Set: {cs.id}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVerify(cs.id);
                                }}
                                disabled={actionLoading === `verify-${cs.id}`}
                                className="text-[8px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors cursor-pointer disabled:opacity-30 font-medium"
                              >
                                {actionLoading === `verify-${cs.id}`
                                  ? '...'
                                  : verifications[cs.id]
                                    ? 'Verified'
                                    : 'Verify'}
                              </button>
                              {/* Show verification result */}
                              {verifications[cs.id] && (
                                <span
                                  className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                                    verifications[cs.id].status === 'passed'
                                      ? 'bg-green-400/10 text-green-400'
                                      : verifications[cs.id].status === 'failed'
                                        ? 'bg-red-400/10 text-red-400'
                                        : 'bg-amber-400/10 text-amber-400'
                                  }`}
                                >
                                  {verifications[cs.id].summary
                                    ? `${verifications[cs.id].summary.passed}/${verifications[cs.id].summary.total}`
                                    : verifications[cs.id].status}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expanded: task list */}
                        {isExpanded && plan.tasks && plan.tasks.length > 0 && (
                          <div className="ml-3 mt-1 border-l-2 border-(--vestara-accent-border) pl-3 space-y-0.5">
                            {plan.tasks.map((task, ti) => (
                              <div key={task.id || ti} className="flex items-center gap-2 text-[10px] py-0.5">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    task.status === 'completed'
                                      ? 'bg-green-500'
                                      : task.status === 'in-progress' || task.status === 'in_progress'
                                        ? 'bg-amber-400'
                                        : task.status === 'blocked'
                                          ? 'bg-red-400'
                                          : 'bg-(--vestara-text-dim)'
                                  }`}
                                />
                                <span className="text-(--vestara-text-2) truncate flex-1">{task.summary || task.description || task.id}</span>
                                {task.effort && (
                                  <span className="text-(--vestara-text-dim) text-[8px]">({task.effort})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {group.items.length > 5 && (
                    <div className="text-[8px] text-(--vestara-text-dim) text-center py-1">
                      +{group.items.length - 5} more {group.label.toLowerCase()} plans
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Links */}
      <div className="flex gap-2 mt-2">
        <a
          href="/artifacts"
          className="flex-1 block text-[10px] text-(--vestara-text-muted) text-center py-1.5 hover:text-(--vestara-text-2) transition-colors rounded-lg bg-(--vestara-accent-bg) border border-(--vestara-accent-border)"
        >
          All Plans & Artifacts →
        </a>
        <a
          href="/sessions"
          className="flex-1 block text-[10px] text-(--vestara-text-muted) text-center py-1.5 hover:text-(--vestara-text-2) transition-colors rounded-lg bg-(--vestara-accent-bg) border border-(--vestara-accent-border)"
        >
          Execution Sessions →
        </a>
      </div>
    </DashboardSection>
  );
}
