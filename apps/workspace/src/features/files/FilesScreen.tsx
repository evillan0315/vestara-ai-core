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

import { useMemo } from 'react';
import { EmptyState, Pill } from '@vestara/ui';
import { InsightBanner } from '../../pages/Marketplace/MarketplaceLayout-components.js';
import '../../styles/marketplace.css';
import '../../styles/execution.css';
import '../../styles/activity-room.css';
import './files.tokens.css';
import { FilesWorkspace } from './components/FilesWorkspace';
import { flattenEntries } from './file-tree-utils';
import { useFiles } from './hooks/useFiles';

function LoadingSkeleton() {
  return (
    <div className="w-full min-w-0 space-y-4" role="status" aria-live="polite" aria-label="Loading files">
      <div className="mpg-skeleton h-44" />
      <div className="mpg-skeleton h-64" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="mpg-skeleton h-40" />
        ))}
      </div>
      <p className="sr-only">Loading workspace files…</p>
    </div>
  );
}

export function FilesScreen() {
  const { data, isLoading, error, refetch } = useFiles();

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
    <div className="ar-page files-enterprise flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <h1 className="sr-only">Files</h1>

      {(error || data.fromSnapshot) && (
        <div className="mb-3">
          <InsightBanner
            severity="warning"
            description={error ?? 'Live filesystem scan unavailable — showing cached snapshot for storage insights.'}
            action={
              <Pill onClick={() => void refetch()} className="shrink-0">
                Retry
              </Pill>
            }
          />
        </div>
      )}

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden sm:mt-2">
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
        />
      </div>
    </div>
  );
}
