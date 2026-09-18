import WorkspacePanelLayout from '../layouts/WorkspacePanelLayout';
import OperationalWorkspaceLayout from '../layouts/OperationalWorkspaceLayout';
import TerminalWorkspace from '../components/terminal/TerminalWorkspace';
import { TerminalHero } from '../components/terminal/TerminalHero';
import { TerminalInspector } from '../components/terminal/TerminalInspector';

export default function TerminalPage() {
  return (
    <WorkspacePanelLayout fluid>
      <TerminalHero />
      <OperationalWorkspaceLayout>
        <TerminalWorkspace />
        <TerminalInspector />
      </OperationalWorkspaceLayout>
    </WorkspacePanelLayout>
  );
}
