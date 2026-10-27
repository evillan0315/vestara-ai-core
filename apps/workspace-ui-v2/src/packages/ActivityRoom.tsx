import { useEffect, useState } from 'react';
import { fetchActivitySnapshot, formatStreamAge, type LiveParticipant, type LiveStreamItem } from '../lib/activity';
import {
  ACTIVITY_BRIDGE_STATUS,
  ACTIVITY_COUNTS,
  ACTIVITY_PARTICIPANTS,
  ACTIVITY_RECORDS,
  participantLabel,
} from './activity.fixtures';

type LoadState = 'loading' | 'live' | 'fixture';

function isPresent(presence: string): boolean {
  return presence === 'online' || presence === 'active' || presence === 'available';
}

export function ActivityRoomPkg() {
  const [participants, setParticipants] = useState<readonly LiveParticipant[] | null>(null);
  const [stream, setStream] = useState<readonly LiveStreamItem[] | null>(null);
  const [complete, setComplete] = useState(true);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchActivitySnapshot()
      .then((snap) => {
        if (cancelled) return;
        if (snap.participants.length > 0) setParticipants(snap.participants);
        if (snap.stream.length > 0) setStream(snap.stream);
        setComplete(snap.complete);
        setState(snap.participants.length > 0 || snap.stream.length > 0 ? 'live' : 'fixture');
      })
      .catch(() => {
        if (!cancelled) setState('fixture');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = state === 'live';
  const participantCount = participants?.length ?? ACTIVITY_COUNTS.participants;
  const recordCount = stream?.length ?? ACTIVITY_COUNTS.records;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0 h-full min-h-[400px]">
      <div className="border-r border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-2 flex flex-col">
        <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] px-2 py-2">
          ALL PARTICIPANTS • {live ? (participants?.length ?? 0) : participantCount} TOTAL
        </div>
        <div className="space-y-1 flex-1">
          {participants
            ? participants.map((p) => (
                <div
                  key={p.id}
                  className="px-2 py-1.5 rounded-[var(--vestara-radius-lg)] hover:bg-[var(--vestara-surface-shell-raised)] text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)] flex justify-between"
                >
                  <span>
                    {p.name}
                    {p.workState ? ` ${p.workState}` : ''} {p.presence}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isPresent(p.presence) ? 'bg-[var(--vestara-accent-shell)]' : 'bg-[var(--vestara-text-shell-muted)]'}`}
                  />
                </div>
              ))
            : ACTIVITY_PARTICIPANTS.map((p) => (
                <div
                  key={p.agent}
                  className="px-2 py-1.5 rounded-[var(--vestara-radius-lg)] hover:bg-[var(--vestara-surface-shell-raised)] text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)] flex justify-between"
                >
                  <span>{participantLabel(p)}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--vestara-accent-shell)] mt-1.5" />
                </div>
              ))}
        </div>
        <div className="p-2 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] mt-2">
          <div className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-muted)]">
            {ACTIVITY_BRIDGE_STATUS.service}
          </div>
          <div className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-status-shell-danger)]">
            {ACTIVITY_BRIDGE_STATUS.state}
          </div>
          <div className="text-[length:var(--vestara-font-size-micro-small)] font-mono text-[var(--vestara-text-shell-muted)] mt-1">
            {ACTIVITY_BRIDGE_STATUS.endpoint}
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="h-9 border-b border-[var(--vestara-border-shell)] px-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
              LIVE OPERATIONS
            </span>
            <span className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
              Activity Room
            </span>
            <span className="text-[length:var(--vestara-font-size-micro)] px-1.5 py-0.5 rounded bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-muted)]">
              {recordCount} records
            </span>
          </div>
          <div className="flex gap-1">
            <span
              className={`text-[length:var(--vestara-font-size-micro)] px-2 py-0.5 rounded-full border ${
                live
                  ? 'bg-[var(--vestara-status-shell-success)]/10 border-[var(--vestara-status-shell-success)]/20 text-[var(--vestara-status-shell-success)]'
                  : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)]'
              }`}
            >
              {live ? 'LIVE' : state === 'loading' ? '…' : 'SNAPSHOT'}
            </span>
          </div>
        </div>
        <div className="flex-1 p-3 space-y-2 overflow-auto">
          {!complete && (
            <div className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-status-shell-danger)]/5 border border-[var(--vestara-status-shell-danger)]/15 px-3 py-2 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--vestara-status-shell-danger)] animate-pulse" />
              Activity snapshot incomplete • streaming
            </div>
          )}
          {stream
            ? stream.map((it) => {
                const age = formatStreamAge(it.timestamp);
                return (
                  <div
                    key={it.id}
                    className="flex gap-2 p-2 rounded-[var(--vestara-radius-lg)] hover:bg-[var(--vestara-surface-shell-raised)]/50"
                  >
                    <div className="w-6 h-6 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-caption)]">
                      {it.actor[0]}
                    </div>
                    <div>
                      <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]">
                        {it.actor} • <span className="text-[var(--vestara-text-shell-muted)]">{it.content}</span>
                      </div>
                      {age && (
                        <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                          {age} ago
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            : ACTIVITY_RECORDS.map((it) => (
                <div
                  key={`${it.actor}-${it.age}`}
                  className="flex gap-2 p-2 rounded-[var(--vestara-radius-lg)] hover:bg-[var(--vestara-surface-shell-raised)]/50"
                >
                  <div className="w-6 h-6 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-caption)]">
                    {it.actor[0]}
                  </div>
                  <div>
                    <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]">
                      {it.actor} • <span className="text-[var(--vestara-text-shell-muted)]">{it.message}</span>
                    </div>
                    <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                      {it.age} ago
                    </div>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
