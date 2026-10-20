/**
 * Files — production workspace (FILES-PAGE-001).
 *
 * Operational surface: OperationalWorkspaceLayout owns the banner/rail/main/
 * context/footer geometry (same shell as Orchestration and the Activity Room);
 * FilesScreen owns the file-browser composition rendered in the main region.
 * File operations state is shared with the Operations page via
 * FileOperationsContext; execution audit lives on the Execution page.
 */

import { FilesScreen } from '../features/files/FilesScreen';
import OperationalWorkspaceLayout from '../layouts/OperationalWorkspaceLayout';

export default function Files() {
  return (
    <OperationalWorkspaceLayout>
      <FilesScreen />
    </OperationalWorkspaceLayout>
  );
}
