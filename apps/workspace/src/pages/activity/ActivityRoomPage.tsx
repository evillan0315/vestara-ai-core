import { useCallback, useEffect, useState } from 'react';
import { useActivityStream } from '../../hooks/useActivityStream';
import { hydrateVisualConfig } from './visual-config';
import ActivityComposer from './ActivityComposer';
import ActivityCorrectionDialog from './ActivityCorrectionDialog';
import ActivityDetailModal from './ActivityDetailModal';
import ActivityScopeSelector from './ActivityScopeSelector';
import ActivitySidebar, { type WorkflowParticipant } from './ActivitySidebar';
import ActivityStatePanel from './ActivityStatePanel';
import ActivityStream from './ActivityStream';
import VisualEditMode from './VisualEditMode';
import type { ActivityConnectionState, ActivityRecord } from './activity-types';

const STATE_LABELS: Record<ActivityConnectionState, { label: string; color: string }> = {
  connecting: { label: 'Connecting', color: 'bg-(--vestara-amber)' },
  live: { label: 'Live', color: 'bg-(--vestara-green)' },
  reconnecting: { label: 'Reconnecting', color: 'bg-(--vestara-amber)' },
  offline: { label: 'Offline', color: 'bg-(--vestara-red)' },
  paused: { label: 'Paused locally', color: 'bg-(--vestara-amber)' },
  error: { label: 'Resynchronizing', color: 'bg-(--vestara-amber)' },
};

interface LiveStreamItem {
  threadId: string;
  role: string;
  agentId: string;
  sessionId?: string;
  text: string;
  lastActivityAt: string;
}

export default function ActivityRoomPage() {
  const stream = useActivityStream();
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [detailRecord, setDetailRecord] = useState<ActivityRecord | null>(null);
  const [referencedRecord, setReferencedRecord] = useState<ActivityRecord | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<ActivityRecord | null>(null);
  const [visualEdit, setVisualEdit] = useState(false);
  const [participants, setParticipants] = useState<readonly WorkflowParticipant[] | undefined>(undefined);
  const [liveStream, setLiveStream] = useState<readonly LiveStreamItem[]>([]);

  const selectAgent = useCallback((agentId: string | undefined) => setSelectedAgentId(agentId), []);
  const openDetail = useCallback((record: ActivityRecord) => setDetailRecord(record), []);
  const closeDetail = useCallback(() => setDetailRecord(null), []);
  const referenceRecord = useCallback((record: ActivityRecord) => setReferencedRecord(record), []);
  const clearReference = useCallback(() => setReferencedRecord(null), []);
  const startCorrection = useCallback((record: ActivityRecord) => setCorrectionTarget(record), []);
  const closeCorrection = useCallback(() => setCorrectionTarget(null), []);
  const stateInfo = STATE_LABELS[stream.state] ?? STATE_LABELS.offline;

  // Reconstruct persisted visual decisions across reload/restart.
  useEffect(() => {
    void hydrateVisualConfig();
  }, []);

  // The selected workflow's real organization: participants + live narrative.
  const workflowId = stream.scope.workflowId;
  useEffect(() => {
    if (!workflowId) {
      setParticipants(undefined);
      setLiveStream([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [pRes, lRes] = await Promise.all([
          fetch(`/api/workflow/${encodeURIComponent(workflowId)}/participants`),
          fetch(`/api/workflow/${encodeURIComponent(workflowId)}/live-stream`),
        ]);
        if (cancelled) return;
        if (pRes.ok) setParticipants(((await pRes.json()) as { participants?: WorkflowParticipant[] }).participants);
        if (lRes.ok) setLiveStream(((await lRes.json()) as { live?: LiveStreamItem[] }).live ?? []);
      } catch {
        // keep prior state on transient failure
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workflowId]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Activity Room</h1>
          <p className="mt-0.5 text-[10px] text-(--vestara-text-muted)">
            {stream.latestSequence > 0 ? `Sequence ${stream.latestSequence}` : 'No activity yet'} ·{' '}
            {stream.records.length} records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[10px] text-(--vestara-text-2)">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateInfo.color}`} />
            {stateInfo.label}
          </span>
          <button
            type="button"
            onClick={() => setVisualEdit((value) => !value)}
            aria-pressed={visualEdit}
            className={`rounded-lg border px-3 py-1 text-[10px] transition-colors cursor-pointer ${
              visualEdit
                ? 'border-(--vestara-accent-text) bg-(--vestara-accent-text)/10 text-(--vestara-accent-text)'
                : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-(--vestara-text-2) hover:text-(--vestara-text)'
            }`}
          >
            {visualEdit ? 'Visual Edit: On' : 'Visual Edit'}
          </button>
          <button
            type="button"
            onClick={stream.paused ? stream.resume : stream.pause}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
          >
            {stream.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={stream.clear}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            title="Clear local view"
          >
            Clear
          </button>
        </div>
      </header>

      {stream.error && (
        <div className="rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)">
          {stream.error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="w-72 shrink-0 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
          <div className="mb-2 px-3 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Participants</div>
          <ActivitySidebar records={stream.records} selectedAgentId={selectedAgentId} onSelectAgent={selectAgent} participants={participants} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">
              {selectedAgentId === undefined ? 'Activity Stream' : `Activity — ${selectedAgentId}`}
            </div>
            <ActivityScopeSelector records={stream.records} scope={stream.scope} onScopeChange={stream.applyScope} />
          </div>
          <ActivityStatePanel />
          {liveStream.length > 0 && (
            <div className="mb-2 max-h-32 overflow-y-auto rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3">
              <div className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Live session</div>
              <div className="space-y-1">
                {liveStream.map((item) => (
                  <div key={item.threadId} className="text-[10px] leading-snug">
                    <span className="font-medium text-(--vestara-text-2)">
                      {item.role[0].toUpperCase() + item.role.slice(1)} — Live
                    </span>
                    <span className="block whitespace-pre-wrap text-(--vestara-text-muted)">{item.text.slice(-600)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ActivityStream
            records={stream.records}
            selectedAgentId={selectedAgentId}
            stateLabel={stateInfo.label}
            scope={stream.scope}
            loading={stream.state === 'connecting'}
            unread={stream.unread}
            onClearUnread={stream.clearUnread}
            onReportViewport={stream.reportViewport}
            onOpenDetail={openDetail}
            onReference={referenceRecord}
            onCorrect={startCorrection}
            sendStates={stream.sendStates}
            onRetry={stream.retrySend}
          />
          <ActivityComposer
            targetAgentId={selectedAgentId}
            onTargetChange={selectAgent}
            onSend={stream.sendMessage}
            onRetry={stream.retrySend}
            sendStates={stream.sendStates}
            referencedRecord={referencedRecord}
            onClearReference={clearReference}
          />
        </main>
      </div>

      <ActivityDetailModal record={detailRecord} onClose={closeDetail} records={stream.records} />
      {correctionTarget && (
        <ActivityCorrectionDialog target={correctionTarget} onClose={closeCorrection} onSend={stream.sendMessage} />
      )}
      {visualEdit && <VisualEditMode />}
    </div>
  );
}
