import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';
import { EmptyState } from '../shared/empty-state.js';
import { type HarnessTone, harnessStatusTone } from '../state/harness-presentation.js';
import type { HarnessApproval, HarnessTaskSnapshot, HarnessThreadSummary } from '../types.js';

export interface ExecutionViewProps {
  readonly palette: TuiSemanticPalette;
  readonly threads: readonly HarnessThreadSummary[];
  readonly selectedThreadId?: string;
  readonly snapshot?: HarnessTaskSnapshot;
  readonly onSelectThread: (threadId: string) => void;
}

function toneColor(tone: HarnessTone, palette: TuiSemanticPalette): string {
  switch (tone) {
    case 'success':
      return palette.success;
    case 'warning':
      return palette.warning;
    case 'error':
      return palette.error;
    case 'active':
      return palette.accent;
    case 'muted':
      return palette.textMuted;
  }
}

export function ExecutionView(props: ExecutionViewProps): ReactNode {
  if (props.threads.length === 0) {
    return (
      <box flexDirection="column">
        <text fg={props.palette.accent}>Execution</text>
        <EmptyState
          palette={props.palette}
          title="No execution data yet."
          description="Run a request to see harness execution activity here."
          action={{ label: 'Go to Chat', onPress: () => props.onSelectThread('chat') }}
        />
      </box>
    );
  }
  const thread = props.threads.find((item) => item.id === props.selectedThreadId) ?? props.threads[0];
  return (
    <box flexDirection="column">
      <text fg={props.palette.accent}>Execution</text>
      <box flexDirection="column" paddingTop={1}>
        {props.threads.map((item) => {
          const active = item.id === thread.id;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: terminal row affordance; keyboard is primary.
            <box
              key={item.id}
              flexDirection="row"
              backgroundColor={active ? props.palette.backgroundElement : undefined}
              onMouseDown={() => props.onSelectThread(item.id)}
            >
              <text fg={active ? props.palette.accent : props.palette.text}>
                {active ? '› ' : '  '}
                {item.title}
              </text>
              <text fg={toneColor(harnessStatusTone(item.status), props.palette)}> [{item.status}]</text>
              <text fg={props.palette.textDim}> {item.phase}</text>
            </box>
          );
        })}
      </box>
      {props.snapshot ? (
        <box flexDirection="column" paddingTop={1}>
          <text fg={props.palette.textMuted}>Activity</text>
          {props.snapshot.activity.slice(-10).map((activity) => (
            <box key={activity.id} flexDirection="row">
              <text fg={toneColor(harnessStatusTone(activity.status), props.palette)}>
                {activity.timestamp.slice(11, 19) ?? ''} {activity.label}
              </text>
              {activity.detail ? <text fg={props.palette.textDim}> {activity.detail}</text> : null}
            </box>
          ))}
          <ApprovalsSection palette={props.palette} approvals={props.snapshot.approvals} />
          <text fg={props.palette.textMuted} paddingTop={1}>
            Verification: {props.snapshot.verification?.status ?? 'not run'}
            {props.snapshot.verification?.confidence !== undefined
              ? ` · ${Math.round(props.snapshot.verification.confidence * 100)}% confidence`
              : ''}
          </text>
          <text fg={props.palette.textMuted} paddingTop={1}>
            Files changed: {props.snapshot.thread.changedFileCount} · Branch: {props.snapshot.thread.branch ?? '—'}
          </text>
        </box>
      ) : null}
    </box>
  );
}

function ApprovalsSection(props: { palette: TuiSemanticPalette; approvals: readonly HarnessApproval[] }): ReactNode {
  const pending = props.approvals.filter((approval) => approval.status === 'pending');
  if (!pending.length) return null;
  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={props.palette.warning}>Approvals required</text>
      {pending.map((approval) => (
        <box key={approval.id} flexDirection="row">
          <text fg={props.palette.warning}>⚠ {approval.tool}</text>
          <text fg={props.palette.textDim}> {approval.reason}</text>
        </box>
      ))}
    </box>
  );
}
