/**
 * Files — production workspace (FILES-PAGE-001).
 *
 * Thin route shell: FilesScreen owns the workspace composition.
 * File operations state is shared with the Operations page via
 * FileOperationsContext; execution audit lives on the Execution page.
 */

import { FilesScreen } from '../features/files/FilesScreen';

export default function Files() {
  return (
    <div className="space-y-4">
      <FilesScreen />
    </div>
  );
}
