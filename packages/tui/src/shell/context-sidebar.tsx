import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';
import type { RoutingSelection, SessionSummary } from '../types.js';
import { SidebarCard } from './sidebar-card.js';

export interface ContextSidebarProps {
  readonly palette: TuiSemanticPalette;
  readonly session?: SessionSummary;
  readonly routing?: RoutingSelection;
  readonly files: readonly { path: string; status?: string }[];
  readonly agents: readonly { id: string; name: string; status: string; task?: string }[];
  readonly connection: string;
  readonly onAction?: (action: 'search' | 'runtime') => void;
}

export function ContextSidebar(props: ContextSidebarProps): ReactNode {
  const activeAgent =
    props.routing?.agents.find((agent) => agent.id === props.routing?.activeAgentId) ?? props.agents[0];
  const developerRoute = props.routing?.roles.developer;
  const candidate = props.routing?.candidates.find(
    (item) => item.ref.providerId === developerRoute?.providerId && item.ref.modelId === developerRoute?.modelId,
  );
  return (
    <box
      width={32}
      flexDirection="column"
      backgroundColor={props.palette.backgroundPanel}
      paddingLeft={1}
      paddingRight={1}
    >
      <scrollbox flexGrow={1}>
        <SidebarCard palette={props.palette} title="Session">
          <text fg={props.palette.text}>{props.session?.title ?? 'New session'}</text>
          <text fg={props.palette.textDim}>{props.session?.status ?? 'Ready'}</text>
        </SidebarCard>
        <SidebarCard palette={props.palette} title="Context">
          <text fg={props.palette.textMuted}>{props.files.length} files in context</text>
          <text fg={props.palette.textDim}>Usage available after execution</text>
        </SidebarCard>
        <SidebarCard palette={props.palette} title="Agent">
          <text fg={props.palette.text}>{activeAgent?.name ?? 'No active agent'}</text>
          <text fg={props.palette.textDim}>{activeAgent?.status ?? 'idle'}</text>
        </SidebarCard>
        <SidebarCard palette={props.palette} title="Model">
          <text fg={props.palette.text}>{candidate?.ref.modelId ?? 'Not selected'}</text>
          <text fg={props.palette.textDim}>{candidate?.providerName ?? 'No provider route'}</text>
        </SidebarCard>
        <SidebarCard palette={props.palette} title="Files">
          {props.files.slice(0, 5).map((file) => (
            <text key={file.path} fg={props.palette.textMuted}>
              {file.path}
            </text>
          ))}
          {props.files.length > 5 ? <text fg={props.palette.textDim}>+{props.files.length - 5} more</text> : null}
        </SidebarCard>
        <SidebarCard palette={props.palette} title="Tools">
          <text fg={props.palette.success}>● Filesystem</text>
          <text fg={props.palette.success}>● Terminal</text>
          <text fg={props.palette.success}>● Git</text>
        </SidebarCard>
        <SidebarCard palette={props.palette} title="Quick Actions">
          <text fg={props.palette.text}>Ctrl+P Search</text>
          <text fg={props.palette.text}>Ctrl+R Provider / Model</text>
        </SidebarCard>
      </scrollbox>
      <text fg={props.connection === 'connected' ? props.palette.success : props.palette.warning}>
        {props.connection === 'connected' ? 'Runtime connected' : props.connection}
      </text>
    </box>
  );
}
