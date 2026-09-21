import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';

import { DefaultChunkEngine } from '../src/chunking/index.js';
import { DefaultDocumentParser } from '../src/parser/index.js';
import { KnowledgeStorage } from '../src/storage/index.js';

const uri = '.tmp/rag-learning/rag-sample.md';

const content = `# Vestara RAG Sample

Vestara stores knowledge as documents.

Documents are divided into chunks before embeddings are generated.

Embeddings represent text as numerical vectors.

Semantic retrieval compares a query vector with stored chunk vectors.

Retrieved chunks become evidence for grounded generation.
`;

describe('Knowledge Engine baseline', () => {
  it('parses a source into a deterministic KnowledgeDocument', () => {
    const parser = new DefaultDocumentParser();

    const document = parser.parse(uri, content);

    expect(document.id).toBe('doc-LnRtcC9yYWctbGVhcm5pbmcvcmFnLXNh');
    expect(document.uri).toBe(uri);
    expect(document.title).toBe('rag-sample.md');
    expect(document.language).toBe('markdown');
    expect(document.mimeType).toBe('text/markdown');
    expect(document.metadata).toEqual({
      extension: 'md',
      size: 308,
      lines: 12,
    });
  });

  it('creates deterministic overlapping chunks', () => {
    const parser = new DefaultDocumentParser();
    const chunker = new DefaultChunkEngine();

    const document = parser.parse(uri, content);
    const chunks = chunker.chunk(document, 5, 2);

    expect(chunks).toHaveLength(4);

    expect(chunks.map((chunk) => [chunk.startLine, chunk.endLine])).toEqual([
      [1, 5],
      [4, 8],
      [7, 11],
      [10, 12],
    ]);
  });

  it('persists documents and performs current lexical search', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    try {
      const parser = new DefaultDocumentParser();
      const chunker = new DefaultChunkEngine();
      const storage = new KnowledgeStorage(db);

      const document = parser.parse(uri, content);
      const chunks = chunker.chunk(document, 5, 2);

      await storage.saveDocument(document);
      await storage.saveChunks(chunks);

      const results = await storage.search('numerical vectors');

      expect(results).toHaveLength(1);
      expect(results[0]?.document.id).toBe(document.id);
      expect(results[0]?.score).toBe(1.0);
    } finally {
      db.close();
    }
  });
  it('characterizes current re-indexing behavior', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    try {
      const parser = new DefaultDocumentParser();
      const chunker = new DefaultChunkEngine();
      const storage = new KnowledgeStorage(db);

      const original = parser.parse(uri, content);
      await storage.saveDocument(original);
      await storage.saveChunks(chunker.chunk(original, 5, 2));

      expect((await storage.getStats()).chunks).toBe(4);

      const shorter = parser.parse(uri, '# Vestara RAG Sample\n\nShortened.\n');
      await storage.saveDocument(shorter);
      await storage.saveChunks(chunker.chunk(shorter, 5, 2));

      const stats = await storage.getStats();

      expect(stats.documents).toBe(1);
      expect(stats.chunks).toBe(4);
    } finally {
      db.close();
    }
  });
});
