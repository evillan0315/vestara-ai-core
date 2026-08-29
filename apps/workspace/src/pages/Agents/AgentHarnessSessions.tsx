import { useEffect, useState } from 'react';
import { HarnessThreadTimeline } from '../../components/execution/harness-timeline';
import { WorkflowRail } from '../../components/workflow/WorkflowRail';
import { threadIdFromSession } from '../../lib/agent-harness';
import { type WorkflowProjection, workflowApi } from '../../lib/workflow';
import type { HarnessSessionEntry } from './types';

interface AgentHarnessSessionsProps {
  sessions: HarnessSessionEntry[];
  onLoad: () => void;
}

export default function AgentHarnessSessions({ sessions, onLoad }: AgentHarnessSessionsProps) {
  const [selectedHarnessSession, setSelectedHarnessSession] = useState<string | null>(null);
  const [harnessWorkflow, setHarnessWorkflow] = useState<WorkflowProjection | null>(null);

  // Load the canonical workflow projection for the selected harness session.
  useEffect(() => {
    const session = sessions.find((entry) => entry.id === selectedHarnessSession);
    const threadId = session ? threadIdFromSession(session.workflowId) : null;
    if (!threadId) {
      setHarnessWorkflow(null);
      return;
    }
    let cancelled = false;
    void workflowApi.workflow(threadId).then((data) => {
      if (!cancelled && data?.projection) setHarnessWorkflow(data.projection);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedHarnessSession, sessions]);

  if (sessions.length === 0) return null;

  return (
    <div className="mt-3 border-t border-(--vestara-accent-border) pt-2">
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1">
        Harness Sessions ({sessions.length})
      </div>
      <div className="space-y-1">
        {sessions.slice(0, 5).map((s) => {
          const threadId = threadIdFromSession(s.workflowId);
          return (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedHarnessSession(selectedHarnessSession === s.id ? null : s.id)}
                className="w-full text-left flex items-center gap-2 text-[11px] text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer py-0.5"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === 'running' ? 'bg-(--vestara-green) animate-pulse' : 'bg-zinc-600'}`}
                />
                <span className="truncate flex-1">{s.goal || s.id}</span>
                <span className="text-[9px] text-(--vestara-text-muted)">{s.status}</span>
              </button>
              {selectedHarnessSession === s.id && threadId && (
                <>
                  <WorkflowRail workflow={harnessWorkflow} onRefresh={onLoad} />
                  <div className="mt-2">
                    <HarnessThreadTimeline threadId={threadId} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
