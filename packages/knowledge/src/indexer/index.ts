import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ChunkEngine } from '../chunking/index.js';
import type { DocumentParser } from '../parser/index.js';
import type { KnowledgeStorage } from '../storage/index.js';
import type { IndexReport, KnowledgeChunk, KnowledgeDocument } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// FILESYSTEM INDEXER
// ═══════════════════════════════════════════════════════════════

export interface KnowledgeIndexer {
  indexDirectory(rootDir: string): Promise<IndexReport>;
  indexFiles(filePaths: string[], rootDir: string): Promise<IndexReport>;
  indexFile(filePath: string): Promise<KnowledgeDocument | null>;
  removeFile(filePath: string): Promise<void>;
}

export class DefaultKnowledgeIndexer implements KnowledgeIndexer {
  private parser: DocumentParser;
  private chunker: ChunkEngine;
  private storage: KnowledgeStorage;
  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(opts: {
    parser: DocumentParser;
    chunker: ChunkEngine;
    storage: KnowledgeStorage;
    logger?: Logger;
    eventBus?: EventBus;
  }) {
    this.parser = opts.parser;
    this.chunker = opts.chunker;
    this.storage = opts.storage;
    this.logger = opts.logger?.child({ component: 'indexer' });
    this.eventBus = opts.eventBus;
  }

  async indexDirectory(rootDir: string): Promise<IndexReport> {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const ignoreDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      '__pycache__',
      '.cache',
      'target',
      '.venv',
      '.vestara',
    ]);

    const files: string[] = [];

    const walkDir = (dir: string): void => {
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stat: any;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (!ignoreDirs.has(entry)) walkDir(fullPath);
        } else if (stat.isFile() && stat.size < 1024 * 1024) {
          const ext = entry.split('.').pop()?.toLowerCase() ?? '';
          if (this.parser.supports(ext) || entry === 'Dockerfile') {
            files.push(fullPath);
          }
        }
      }
    };

    walkDir(rootDir);
    return this.indexFiles(files, rootDir);
  }

  async indexFiles(filePaths: string[], _rootDir: string): Promise<IndexReport> {
    const start = performance.now();
    let docsIndexed = 0;
    let chunksCreated = 0;
    const CONCURRENCY = 8;

    // Process files in parallel batches, bulk-saving each batch
    for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
      const batchStart = performance.now();
      const batch = filePaths.slice(i, i + CONCURRENCY);

      // Parse files concurrently
      const results = await Promise.all(
        batch.map(async (fullPath) => {
          const fs = await import('node:fs');
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const doc = this.parser.parse(fullPath, content);
            const chunks = this.chunker.chunk(doc);
            return { doc, chunks };
          } catch {
            return null;
          }
        }),
      );

      const docs: KnowledgeDocument[] = [];
      const allChunks: KnowledgeChunk[][] = [];

      for (const r of results) {
        if (r) {
          docs.push(r.doc);
          allChunks.push(r.chunks);
          docsIndexed++;
          chunksCreated += r.chunks.length;
        }
      }

      // Bulk save with transaction + batch INSERT
      if (docs.length > 0) {
        const batchPerf = performance.now() - batchStart;
        const saveStart = performance.now();
        await this.storage.bulkSave(docs, allChunks);
        const saveDuration = Math.round(performance.now() - saveStart);
        this.logger?.debug('Batch indexed', {
          files: docs.length,
          chunks: allChunks.reduce((s, c) => s + c.length, 0),
          parse: `${Math.round(batchPerf - saveDuration)}ms`,
          save: `${saveDuration}ms`,
        });
      }
    }

    const duration = Math.round(performance.now() - start);
    this.logger?.info('Files indexed', {
      count: filePaths.length,
      docsIndexed,
      chunksCreated,
      duration: `${duration}ms`,
    });
    return { documentsIndexed: docsIndexed, chunksCreated, duration };
  }

  async indexFile(filePath: string): Promise<KnowledgeDocument | null> {
    const fs = await import('node:fs');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const doc = this.parser.parse(filePath, content);
      await this.storage.saveDocument(doc);
      const chunks = this.chunker.chunk(doc);
      await this.storage.saveChunks(chunks);
      return doc;
    } catch {
      return null;
    }
  }

  async removeFile(filePath: string): Promise<void> {
    const existing = await this.storage.getDocumentByUri(filePath);
    if (existing) await this.storage.deleteDocument(existing.id);
  }
}
