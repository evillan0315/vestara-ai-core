/**
 * VES-FILES-001: Files Query Hook
 *
 * API-first assembly for the stacked Files page:
 *   - browser tree → GET /api/files/browse (fixture fallback)
 *   - workspace name → GET /api/workspace (fixture fallback)
 *   - storage insights → GET /api/diagnostics/filesystem (fixture fallback)
 *
 * Ops (execution filesystem) stays in FilesOps so each section loads
 * and degrades independently.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 *   FILES-EDITOR-002: tree is a runtime-backed projection (fixture fallback)
 */

import { useCallback, useEffect, useState } from 'react';
import { classifyFile } from '../file-classification';
import { filesFixture } from '../files.fixtures';
import type { FileEntry, FilesViewModel } from '../files.types';

interface BrowseNode {
  readonly name: string;
  readonly path: string;
  readonly kind: 'dir' | 'file';
  readonly size?: number;
  readonly mtime?: string;
  readonly createdAt?: string;
  readonly mimeType?: string;
  readonly children?: readonly BrowseNode[];
}

/** Map a browse-projection node to the FileEntry view model (projection, never authority). */
export function toFileEntries(nodes: readonly BrowseNode[]): FileEntry[] {
  return nodes.map((n) => {
    const language =
      n.kind === 'file' ? classifyFile(n.mimeType ?? 'application/octet-stream', n.path).languageHint : undefined;
    return {
      id: n.path,
      name: n.name,
      path: n.path,
      kind: n.kind,
      ...(n.size !== undefined ? { size: n.size } : {}),
      ...(n.mtime !== undefined ? { mtime: n.mtime } : {}),
      ...(n.createdAt !== undefined ? { createdAt: n.createdAt } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(n.kind === 'dir' ? { children: toFileEntries(n.children ?? []) } : {}),
    };
  });
}

export interface UseFilesReturn {
  readonly data: FilesViewModel | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
}

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useFiles(): UseFilesReturn {
  const [data, setData] = useState<FilesViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ws, scan, browse] = await Promise.all([
        apiFetch<{ workspace?: { name?: string } }>('/api/workspace'),
        apiFetch<{
          dirSizes?: FilesViewModel['dirSizes'];
          largeFiles?: FilesViewModel['largeFiles'];
          recentlyModified?: FilesViewModel['recent'];
        }>('/api/diagnostics/filesystem'),
        apiFetch<{ entries?: BrowseNode[]; truncated?: boolean }>('/api/files/browse?recursive=1'),
      ]);
      const live = scan !== null;
      const treeLive = browse?.entries !== undefined;
      setData({
        workspaceName: ws?.workspace?.name ?? filesFixture.workspaceName,
        entries: treeLive ? toFileEntries(browse.entries ?? []) : filesFixture.entries,
        dirSizes: live && scan?.dirSizes?.length ? scan.dirSizes : filesFixture.dirSizes,
        largeFiles: live && scan?.largeFiles?.length ? scan.largeFiles : filesFixture.largeFiles,
        recent: live && scan?.recentlyModified?.length ? scan.recentlyModified : filesFixture.recent,
        fromSnapshot: !live || !treeLive,
        treeTruncated: browse?.truncated === true,
      });
    } catch (err) {
      setData(filesFixture);
      setError(err instanceof Error ? err.message : 'Failed to fetch files data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
