/**
 * Files — filesystem capability operations surface.
 *
 * Thin reuse of the execution FilesystemPanel (no new domain UI):
 * fixes the dead /files link QuickActions already points at and gives
 * the sidebar "Files" entry a real page.
 */

import { ExecutionProvider } from '../components/execution/ExecutionContext';
import { FilesystemPanel } from '../components/execution/filesystem';
import { PageHero } from '../components/layout/PageHero/PageHero.js';
import '../styles/execution.css';

export default function Files() {
  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Workspace"
        title="Files"
        subtitle="Filesystem capability operations — every read, write, and search agents perform."
        label="Files highlights"
      />
      <ExecutionProvider>
        <FilesystemPanel />
      </ExecutionProvider>
    </div>
  );
}
