/**
 * FILES-PAGE-001: Files Screen Component
 *
 * Stacked composition: production Files workspace (hero, toolbar,
 * explorer, work area, inspector, operations bar), storage insights,
 * capability operations. Renders unwrapped (no PageShell): the route
 * shell owns max-width and gutters.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 *   FILES-PAGE-001: Production Files Workspace
 */

import { useMemo, useState } from 'react';
import { EmptyState, Pill } from '@vestara/ui';
import { InsightBanner } from '@vestara/marketplace-ui';
import '../../styles/marketplace.css';
import '../../styles/execution.css';
import '../../styles/activity-room.css';
import './files.tokens.css';
import { FilesWorkspace } from './components/FilesWorkspace';
import { flattenEntries } from './file-tree-utils';
import { useFiles } from './hooks/useFiles';

function LoadingSkeleton() {
  // Mirrors the loaded 3-pane shell (browser rail / work area / inspector)
  // so the layout does not shift when live data arrives.
  const railRows = ['88%', '64%', '76%', '58%', '82%', '70%'];
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 gap-[var(--vestara-spacing-3)]"
      role="status"
      aria-live="polite"
      aria-label="Loading files"
    >
      <div className="hidden w-80 max-w-[320px] shrink-0 flex-col gap-2 md:flex" aria-hidden="true">
        <div className="mpg-skeleton h-8" />
        {railRows.map((width, i) => (
          <div key={i} className="mpg-skeleton h-6" style={{ width }} />
        ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" aria-hidden="true">
        <div className="mpg-skeleton h-10" />
        <div className="mpg-skeleton h-6 w-2/3" />
        <div className="mpg-skeleton min-h-0 flex-1" />
      </div>
      <div className="hidden w-80 max-w-[320px] shrink-0 flex-col gap-2 lg:flex" aria-hidden="true">
        <div className="mpg-skeleton h-8" />
        <div className="mpg-skeleton h-24" />
        <div className="mpg-skeleton h-16" />
      </div>
      <p className="sr-only">Loading workspace files…</p>
    </div>
  );
}

export function FilesScreen() {
  const { data, isLoading, error, refetch } = useFiles();
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const summary = useMemo(() => {
    if (!data) return { files: 0, dirs: 0, storage: 0 };
    const all = flattenEntries(data.entries);
    return {
      files: all.filter((e) => e.kind === 'file').length,
      dirs: all.filter((e) => e.kind === 'dir').length,
      storage: data.dirSizes.reduce((sum, d) => sum + d.size, 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <>
        <h1 className="sr-only">Files</h1>
        <LoadingSkeleton />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <h1 className="sr-only">Files</h1>
        <div className="flex items-center justify-center py-24">
          <EmptyState title="No data available" description="Workspace file metadata could not be loaded." />
        </div>
      </>
    );
  }

  return (
    <div className="ar-page files-enterprise flex h-full min-h-0 min-w-0 flex-col gap-[var(--vestara-spacing-section)] overflow-hidden">
      {(error || data.fromSnapshot) && !noticeDismissed && (
        <div>
          <InsightBanner
            severity="warning"
            description={error ?? 'Live filesystem scan unavailable — showing cached snapshot for storage insights.'}
            action={
              <span className="flex items-center gap-2">
                <Pill onClick={() => void refetch()} className="shrink-0">
                  Retry
                </Pill>
                <button
                  type="button"
                  onClick={() => setNoticeDismissed(true)}
                  aria-label="Dismiss snapshot notice"
                  className="cursor-pointer rounded-[var(--vestara-radius)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
                >
                  ✕
                </button>
              </span>
            }
          />
        </div>
      )}

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <FilesWorkspace
          workspaceName={data.workspaceName}
          live={!data.fromSnapshot}
          fileCount={summary.files}
          dirCount={summary.dirs}
          storageBytes={summary.storage}
          entries={data.entries}
          isLoading={false}
          fromSnapshot={data.fromSnapshot}
          truncated={data.treeTruncated}
          recent={data.recent}
          onChanged={() => void refetch()}
          onRefresh={() => void refetch()}
        />
      </div>
    </div>
  );
}
