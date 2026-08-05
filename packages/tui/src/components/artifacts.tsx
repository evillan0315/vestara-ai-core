import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface ArtifactSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
}

export interface ArtifactsViewProps {
  readonly palette: TuiSemanticPalette;
  readonly artifacts: readonly ArtifactSummary[];
}

export function ArtifactsView(props: ArtifactsViewProps): ReactNode {
  return (
    <box flexDirection="column">
      <text fg={props.palette.accent}>Artifacts</text>
      {props.artifacts.length === 0 ? (
        <text fg={props.palette.textMuted}>No artifacts produced yet.</text>
      ) : (
        props.artifacts.map((artifact) => (
          <box key={artifact.id} flexDirection="row">
            <text fg={props.palette.text}>▪ {artifact.name}</text>
            <text fg={props.palette.textMuted}> [{artifact.kind}]</text>
            <text
              fg={
                artifact.status === 'verified'
                  ? props.palette.success
                  : artifact.status === 'failed'
                    ? props.palette.error
                    : props.palette.textDim
              }
            >
              {' '}
              {artifact.status}
            </text>
          </box>
        ))
      )}
    </box>
  );
}
