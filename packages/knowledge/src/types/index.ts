/**
 * @vestara/knowledge — Knowledge Runtime (Brain 3)
 *
 * Document ingestion, indexing, search, and retrieval-augmented
 * generation. Understands repositories, documentation, and files
 * as structured knowledge — not just raw text.
 *
 * Architecture Traceability:
 *   Blueprint: 05-ai-core/BRAIN-ARCHITECTURE.md → Brain 3
 *   Specification: AI-CON-002 → Knowledge Engine
 *   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Knowledge
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';

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
