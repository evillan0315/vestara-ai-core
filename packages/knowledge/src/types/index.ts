// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Lifecycle state of an indexed document.
 * - `active` — current source content is reflected in storage.
 * - `stale` — source changed after the last successful index.
 * - `deleted` — source no longer present.
 */
export type KnowledgeDocumentStatus = 'active' | 'stale' | 'deleted';

/**
 * Who vouches for the document's content.
 * - `user` — authored/owned by the workspace user.
 * - `system` — generated or ingested by the platform.
 * - `external` — fetched from an outside source.
 */
export type KnowledgeAuthority = 'user' | 'system' | 'external';

export interface KnowledgeDocument {
  id: string;
  uri: string;
  title: string;
  language: string;
  mimeType: string;
  content: string;
  metadata: Record<string, unknown>;
  indexedAt?: string;
  /** RAG-001 provenance — where the content came from. */
  sourceType?: string;
  /** RAG-001 provenance — sha256 hex of the source content at parse time. */
  contentHash?: string;
  /** RAG-001 provenance — current lifecycle state. */
  status?: KnowledgeDocumentStatus;
  /** RAG-001 provenance — who vouches for the content. */
  authority?: KnowledgeAuthority;
  /** RAG-001 provenance — workspace/repo scope the document belongs to. */
  scope?: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface SearchResult {
  document: KnowledgeDocument;
  chunks: KnowledgeChunk[];
  score: number;
}

export interface IndexReport {
  documentsIndexed: number;
  chunksCreated: number;
  duration: number;
}

export interface ProjectInfo {
  type: string;
  language: string;
  framework?: string;
  packageManager?: string;
  buildTool?: string;
  testFramework?: string;
  hasDocker: boolean;
  hasCI: boolean;
  isMonorepo: boolean;
  fileCount: number;
  totalSizeKB: number;
}
