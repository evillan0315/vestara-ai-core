import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CleaningServicesOutlinedIcon from '@mui/icons-material/CleaningServicesOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { ActionIcon } from '@vestara/ui';
import { SIZING } from '@vestara/ui-tokens';
import { useRef } from 'react';
import Drawer from '../components/ui/Drawer';
import TerminalWorkspace, { type TerminalWorkspaceApi } from '../components/terminal/TerminalWorkspace';
import ActivityFilesPanel from '../pages/activity/ActivityFilesPanel';
import { ActivityDrawerDockControls, ActivityDrawerHeaderActions } from '../pages/activity/ActivityDrawerHeaderActions';
import { useGlobalDrawer } from '../contexts/GlobalDrawerContext';

export default function GlobalDrawerHost() {
  const drawer = useGlobalDrawer();
  const terminalApi = useRef<TerminalWorkspaceApi | null>(null);

  return (
    <>
      <Drawer
        open={drawer.open && drawer.activeSurface === 'terminal'}
        keepMounted
        onClose={drawer.closeDrawer}
        title="Terminal"
        position={drawer.terminalPosition}
        defaultSize="large"
        portal
        panelClassName="ar-terminal-drawer"
        bodyClassName="ar-terminal-drawer__body"
        hideBackdrop
        header={
          <ActivityDrawerHeaderActions
            label="Terminal actions"
            dockControls={<ActivityDrawerDockControls current={drawer.terminalPosition} positions={['left', 'bottom', 'right', 'top']} onDock={drawer.dockTerminal} label="Terminal drawer position" />}
          >
            <ActionIcon label="New terminal session" icon={<AddOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />} tone="muted" size="sm" onClick={() => terminalApi.current?.newSession()} />
            <ActionIcon label="Clear terminal" icon={<CleaningServicesOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />} tone="muted" size="sm" onClick={() => terminalApi.current?.clearActive()} />
            <ActionIcon label="Kill terminal session" icon={<DeleteOutlineOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />} tone="destructive" size="sm" onClick={() => terminalApi.current?.killActive()} />
          </ActivityDrawerHeaderActions>
        }
      >
        <div className="h-full min-h-0 w-full"><TerminalWorkspace ref={terminalApi} hideToolbar /></div>
      </Drawer>

      <Drawer
        open={drawer.open && drawer.activeSurface === 'files'}
        keepMounted
        onClose={drawer.closeDrawer}
        title="Files"
        position={drawer.filesPosition}
        defaultSize="medium"
        portal
        hideBackdrop
        header={<ActivityDrawerHeaderActions label="Files actions" dockControls={<ActivityDrawerDockControls current={drawer.filesPosition} positions={['left', 'right']} onDock={(position) => drawer.dockFiles(position as 'left' | 'right')} label="Files drawer position" />} />}
      >
        <div className="h-full min-h-0 w-full"><ActivityFilesPanel openPath={drawer.filesPath} editDetail={drawer.filesEdit} onAttachToComposer={drawer.attachFileToActivityComposer} /></div>
      </Drawer>
    </>
  );
}
