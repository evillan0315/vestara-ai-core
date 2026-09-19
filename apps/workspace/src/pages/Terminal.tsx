import WorkspacePanelLayout from '../layouts/WorkspacePanelLayout';
import TerminalWorkspace from '../components/terminal/TerminalWorkspace';

export default function TerminalPage() {
  return (
    <WorkspacePanelLayout fluid>
      <TerminalWorkspace />
    </WorkspacePanelLayout>
  );
}
