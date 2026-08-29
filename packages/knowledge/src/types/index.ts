// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface KnowledgeDocument {
  id: string;
  uri: string;
  title: string;
  language: string;
  mimeType: string;
  content: string;
  metadata: Record<string, unknown>;
  indexedAt?: string;
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
