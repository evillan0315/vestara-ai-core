import WorkspacePanelLayout from '../layouts/WorkspacePanelLayout';
import OperationalWorkspaceLayout from '../layouts/OperationalWorkspaceLayout';
import TerminalWorkspace from '../components/terminal/TerminalWorkspace';
import { TerminalHero } from '../components/terminal/TerminalHero';

export default function TerminalPage() {
  return (
    <WorkspacePanelLayout fluid>
      <TerminalHero />
      <OperationalWorkspaceLayout>
        <TerminalWorkspace />
      </OperationalWorkspaceLayout>
    </WorkspacePanelLayout>
  );
}
