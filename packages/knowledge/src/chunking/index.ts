// ═══════════════════════════════════════════════════════════════
// CHUNK ENGINE
// ═══════════════════════════════════════════════════════════════

import type { KnowledgeDocument, KnowledgeChunk } from '../types/index.js';

export interface ChunkEngine {
  chunk(document: KnowledgeDocument, maxSize?: number, overlap?: number): KnowledgeChunk[];
}

export class DefaultChunkEngine implements ChunkEngine {
  chunk(document: KnowledgeDocument, maxSize = 100, overlap = 10): KnowledgeChunk[] {
    const lines = document.content.split('\n');
    const chunks: KnowledgeChunk[] = [];
    let i = 0;

    while (i < lines.length) {
      const end = Math.min(i + maxSize, lines.length);
      const content = lines.slice(i, end).join('\n');
      chunks.push({
        id: `${document.id}-chunk-${chunks.length}`,
        documentId: document.id,
        content,
        startLine: i + 1,
        endLine: end,
      });
      i += maxSize - overlap;
    }

    return chunks;
  }
}
