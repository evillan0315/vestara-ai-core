/**
 * VES-FILES-001: Files Types
 *
 * Read-only view model for the stacked Files page: a workspace file
 * browser (runtime-backed projection via GET /api/files/browse, fixture
 * fallback) plus live storage insights from GET /api/diagnostics/filesystem.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 *   FILES-EDITOR-002: Governed Filesystem Browse Projection
 */

export interface FileEntry {
  /** Stable id (workspace-relative path) */
  readonly id: string;
  /** Display name (basename) */
  readonly name: string;
  /** Workspace-relative path (e.g. "apps/api/src/index.ts") */
  readonly path: string;
  /** Entry kind */
  readonly kind: 'dir' | 'file';
  /** Size in bytes (files only) */
  readonly size?: number;
  /** Last modified ISO-8601 (when known) */
  readonly mtime?: string;
  /** Created ISO-8601 from the browse projection (when known) */
  readonly createdAt?: string;
  /** Language hint for files (e.g. "typescript") */
  readonly language?: string;
  /** MIME type from the browse projection when available */
  readonly mimeType?: string;
  /** Children for directories */
  readonly children?: readonly FileEntry[];
}

export interface FilesDirSize {
  readonly dir: string;
  readonly size: number;
}

export interface FilesLargeFile {
  readonly file: string;
  readonly size: number;
}

export interface FilesRecentFile {
  readonly file: string;
  readonly mtime: string;
}

export interface FilesViewModel {
  /** Workspace display name */
  readonly workspaceName: string;
  /** Top-level browser entries */
  readonly entries: readonly FileEntry[];
  /** Storage insights (live when available, fixture fallback) */
  readonly dirSizes: readonly FilesDirSize[];
  readonly largeFiles: readonly FilesLargeFile[];
  readonly recent: readonly FilesRecentFile[];
  /** True when any section fell back to fixtures */
  readonly fromSnapshot: boolean;
  /** True when the browse projection hit its entry budget (FP-11) */
  readonly treeTruncated: boolean;
}
