import { useCallback, useEffect, useState } from 'react';
import { useActivityRoomModel } from '../../hooks/useActivityRoomModel';
import { useSetActivitySelection } from '../../contexts/SurfaceContext';
import ActivityComposer from './ActivityComposer';
import ActivityCorrectionDialog from './ActivityCorrectionDialog';
import ActivityDetailModal from './ActivityDetailModal';
import ActivityScopeSelector from './ActivityScopeSelector';
import ActivitySidebar, { type WorkflowParticipant } from './ActivitySidebar';
import ActivityStatePanel from './ActivityStatePanel';
import ActivityStream from './ActivityStream';
import ActivityWorkflowBrowser from './ActivityWorkflowBrowser';
import AgentDetailDrawer from './AgentDetailDrawer';
import ExecutionPulse from './ExecutionPulse';
import type {
  ActivityConnectionState,
  ActivityDensity,
  ActivityRecord,
  AuxiliarySourceStatus,
} from './activity-types';
import VisualEditMode from './VisualEditMode';
import { hydrateVisualConfig } from './visual-config';

const STATE_LABELS: Record<ActivityConnectionState, { label: string; color: string }> = {
  connecting: { label: 'Connecting', color: 'bg-(--vestara-amber)' },
  live: { label: 'Live', color: 'bg-(--vestara-green)' },
  reconnecting: { label: 'Reconnecting', color: 'bg-(--vestara-amber)' },
  offline: { label: 'Offline', color: 'bg-(--vestara-red)' },
  paused: { label: 'Paused locally', color: 'bg-(--vestara-amber)' },
  error: { label: 'Resynchronizing', color: 'bg-(--vestara-amber)' },
};

const STATUS_WEIGHT: Record<AuxiliarySourceStatus, number> = {
  idle: 0,
  ready: 1,
  loading: 2,
  stale: 3,
  error: 4,
};

function worstStatus(statuses: readonly AuxiliarySourceStatus[]): AuxiliarySourceStatus {
  let worst: AuxiliarySourceStatus = 'idle';
  for (const status of statuses) {
    if (STATUS_WEIGHT[status] > STATUS_WEIGHT[worst]) worst = status;
  }
  return worst;
}

export default function ActivityRoomPage() {
  const model = useActivityRoomModel();
  const stream = model.stream;
  const setActivitySelection = useSetActivitySelection();
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [detailRecord, setDetailRecord] = useState<ActivityRecord | null>(null);
  const [referencedRecord, setReferencedRecord] = useState<ActivityRecord | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<ActivityRecord | null>(null);
  const [visualEdit, setVisualEdit] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [density, setDensity] = useState<ActivityDensity>('operational');
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null);

  const selectAgent = useCallback((agentId: string | undefined) => {
    setSelectedAgentId(agentId);
    // AR-009: Update SurfaceContext with agent selection
    if (agentId) {
      setActivitySelection({ kind: 'agent', id: agentId, label: agentId });
    } else {
      setActivitySelection(undefined);
    }
  }, [setActivitySelection]);
  const openAgentDrawer = useCallback((agentId: string) => setDrawerAgentId(agentId), []);
  const closeAgentDrawer = useCallback(() => setDrawerAgentId(null), []);
  const openDetail = useCallback((record: ActivityRecord) => {
    setDetailRecord(record);
    // AR-009: Update SurfaceContext with activity selection
    setActivitySelection({
      kind: 'activity',
      id: record.id,
      label: record.content?.slice(0, 50) ?? record.id,
    });
  }, [setActivitySelection]);
  const closeDetail = useCallback(() => setDetailRecord(null), []);
  const referenceRecord = useCallback((record: ActivityRecord) => setReferencedRecord(record), []);
  const clearReference = useCallback(() => setReferencedRecord(null), []);
  const startCorrection = useCallback((record: ActivityRecord) => setCorrectionTarget(record), []);
  const closeCorrection = useCallback(() => setCorrectionTarget(null), []);
  const stateInfo = STATE_LABELS[stream.state] ?? STATE_LABELS.offline;
  const scopeLabel = stream.scope.sessionId
    ? `Session ${stream.scope.sessionId}`
    : stream.scope.workflowId
      ? `Workflow ${stream.scope.workflowId}`
      : 'All activity';

  // Reconstruct persisted visual decisions across reload/restart.
  useEffect(() => {
    void hydrateVisualConfig();
  }, []);

  const workflowId = stream.scope.workflowId;
  const participants = model.participants.data;
  const liveStream = model.liveStream.data ?? [];
  const unreadByAgent = model.receipts.data?.unreadByAgent;
  const auxiliaryStatus = workflowId ? worstStatus([model.participants.status, model.liveStream.status, model.receipts.status]) : 'ready';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
      <header className="flex flex-col gap-3 rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-(--vestara-accent-text)">
            Live operations
          </div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Activity Room</h1>
          <p className="mt-1 text-[10px] text-(--vestara-text-muted)">
            <span className="text-(--vestara-text-2)">{scopeLabel}</span> · {stream.records.length} records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span
            className="flex items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] text-(--vestara-text-2)"
            title="Activity stream connection state"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateInfo.color}`} />
            {stateInfo.label}
          </span>
          <button
            type="button"
            onClick={() => setVisualEdit((value) => !value)}
            aria-pressed={visualEdit}
            className={`rounded-lg border px-3 py-1.5 text-[10px] transition-colors cursor-pointer ${
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
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
          >
            {stream.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={stream.clear}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            title="Clear local view"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setParticipantsOpen(true)}
            className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer lg:hidden"
          >
            Participants
          </button>
        </div>
      </header>

      {stream.error && (
        <div className="flex items-center gap-2 rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)" role="alert">
          <span>{stream.error}</span>
          <button type="button" onClick={stream.retry} className="ml-auto rounded border border-(--vestara-amber-border) px-2 py-1 font-medium cursor-pointer">
            Retry history
          </button>
        </div>
      )}

      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="md:hidden">
            <ActivityScopeSelector records={stream.records} scope={stream.scope} onScopeChange={stream.applyScope} />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-(--vestara-accent-border) p-0.5" role="group" aria-label="Timeline density">
            {(['summary', 'operational', 'raw'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                aria-pressed={density === d}
                className={`rounded-md px-2 py-1 text-[9px] font-medium transition-colors cursor-pointer ${
                  density === d ? 'bg-(--vestara-accent-text)/15 text-(--vestara-accent-text)' : 'text-(--vestara-text-muted) hover:text-(--vestara-text-2)'
                }`}
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-(--vestara-text-muted)">
            {selectedAgentId ? `Filtered to ${selectedAgentId}` : 'All participants'}
            {selectedAgentId && (
              <button type="button" onClick={() => selectAgent(undefined)} className="ml-2 text-(--vestara-accent-text) underline cursor-pointer">
                Clear filter
              </button>
            )}
          </span>
        </div>
      </div>

      {participants && participants.length > 0 && (
        <div className="md:hidden">
          <ExecutionPulse participants={participants} />
        </div>
      )}

      {workflowId && auxiliaryStatus !== 'ready' && (
        <div
          className={`rounded-lg border px-3 py-2 text-[10px] ${
            auxiliaryStatus === 'loading'
              ? 'border-(--vestara-accent-border) text-(--vestara-text-muted)'
              : 'border-(--vestara-amber-border) bg-(--vestara-amber-bg) text-(--vestara-amber)'
          }`}
          role="status"
        >
          {auxiliaryStatus === 'loading'
            ? 'Loading workflow participants and live context…'
            : auxiliaryStatus === 'stale'
              ? 'Workflow context could not be refreshed. Showing the timeline without it.'
              : 'Workflow context is unavailable.'}
          {auxiliaryStatus !== 'loading' && (
            <button type="button" onClick={model.retryAuxiliary} className="ml-2 underline cursor-pointer">
              Retry
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
        <aside className="hidden max-h-56 shrink-0 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 sm:p-3 lg:block lg:max-h-none lg:w-72">
          <div className="mb-2 px-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Participants</div>
          <ActivitySidebar
            records={stream.records}
            selectedAgentId={selectedAgentId}
            onSelectAgent={selectAgent}
            onOpenAgent={openAgentDrawer}
            participants={participants}
            unreadByAgent={unreadByAgent}
          />
        </aside>

        <ActivityWorkflowBrowser
          records={stream.records}
          scope={stream.scope}
          onScopeChange={stream.applyScope}
          units={model.effectiveState.data?.units ?? []}
          status={model.effectiveState.status}
          onRetry={model.retryAuxiliary}
          participants={participants}
          className="hidden shrink-0 md:block md:w-[280px]"
        />

        <main className="flex min-h-[28rem] min-w-0 flex-1 flex-col rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 sm:p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)" aria-live="polite">
              {selectedAgentId === undefined ? 'Activity Stream' : `Activity — ${selectedAgentId}`}
            </div>
            <span className="text-[10px] text-(--vestara-text-muted)">
              {stream.paused ? `${stream.unread} buffered` : stateInfo.label}
            </span>
          </div>
          <ActivityStatePanel scope={stream.scope} source={model.effectiveState} onRetry={model.retryAuxiliary} />
          {liveStream.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5">
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[9px] font-semibold uppercase tracking-widest text-(--vestara-green)">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--vestara-green)" />
                Live Now
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                {liveStream.map((item) => (
                  <div key={item.threadId} className="flex items-center gap-2 text-[10px] leading-snug">
                    <span className="shrink-0 font-medium text-(--vestara-text-2)">
                      {item.role[0].toUpperCase() + item.role.slice(1)}
                    </span>
                    <span className="shrink-0 rounded bg-(--vestara-green)/10 px-1 text-[8px] font-medium uppercase text-(--vestara-green)">
                      Live
                    </span>
                    <span className="block truncate whitespace-pre-wrap text-(--vestara-text-muted)">
                      {item.text.slice(-160)}
                    </span>
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
            density={density}
            freshIds={stream.freshIds}
            onLoadOlder={stream.loadOlder}
            loadingOlder={stream.loadingOlder}
            olderLoaded={stream.olderLoaded}
            onClearUnread={stream.clearUnread}
            onReportViewport={stream.reportViewport}
            onOpenDetail={openDetail}
            onReference={referenceRecord}
            onCorrect={startCorrection}
            sendStates={stream.sendStates}
            onRetry={stream.retrySend}
          />
          <ActivityComposer
            scope={stream.scope}
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

      {participantsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          role="button"
          tabIndex={-1}
          onMouseDown={() => setParticipantsOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') setParticipantsOpen(false);
          }}
          aria-label="Close participants"
        >
          <aside
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl border border-(--vestara-accent-border) bg-(--color-zinc-950) p-3 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Participants and agent filters"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-(--vestara-text)">Participants</h2>
              <button
                type="button"
                onClick={() => setParticipantsOpen(false)}
                className="h-11 w-11 rounded-lg text-lg text-(--vestara-text-2) cursor-pointer"
                aria-label="Close participants"
              >
                ×
              </button>
            </div>
            <ActivitySidebar
              records={stream.records}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => {
                selectAgent(id);
                setParticipantsOpen(false);
              }}
              onOpenAgent={openAgentDrawer}
              participants={participants}
              unreadByAgent={unreadByAgent}
            />
          </aside>
        </div>
      )}

      <ActivityDetailModal record={detailRecord} onClose={closeDetail} records={stream.records} />
      {correctionTarget && (
        <ActivityCorrectionDialog target={correctionTarget} onClose={closeCorrection} onSend={stream.sendMessage} />
      )}
      {visualEdit && <VisualEditMode />}
      <AgentDetailDrawer
        open={drawerAgentId !== null}
        agentId={drawerAgentId}
        participant={(participants ?? []).find((participant) => participant.agentId === drawerAgentId) ?? null}
        onClose={closeAgentDrawer}
      />
    </div>
  );
}
