// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE ENGINE (Orchestrator)
// ═══════════════════════════════════════════════════════════════

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { DefaultRepositoryAnalyzer, type RepositoryAnalyzer } from '../analyzer/index.js';
import { type ChunkEngine, DefaultChunkEngine } from '../chunking/index.js';
import { DefaultKnowledgeIndexer, type KnowledgeIndexer } from '../indexer/index.js';
import { DefaultDocumentParser, type DocumentParser } from '../parser/index.js';
import type { KnowledgeStorage } from '../storage/index.js';
import type { IndexReport, KnowledgeChunk, KnowledgeDocument, ProjectInfo, SearchResult } from '../types/index.js';

export interface KnowledgeEngine {
  readonly storage: KnowledgeStorage;
  readonly parser: DocumentParser;
  readonly chunker: ChunkEngine;
  readonly indexer: KnowledgeIndexer;
  readonly analyzer: RepositoryAnalyzer;

  search(query: string, limit?: number): Promise<SearchResult[]>;
  index(rootDir: string, changedFiles?: string[]): Promise<IndexReport>;
  analyze(files: string[]): ProjectInfo;
  getStats(): Promise<{ documents: number; chunks: number }>;
}

export class DefaultKnowledgeEngine implements KnowledgeEngine {
  readonly storage: KnowledgeStorage;
  readonly parser: DocumentParser;
  readonly chunker: ChunkEngine;
  readonly indexer: KnowledgeIndexer;
  readonly analyzer: RepositoryAnalyzer;

  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(opts: {
    storage: KnowledgeStorage;
    parser?: DocumentParser;
    chunker?: ChunkEngine;
    logger?: Logger;
    eventBus?: EventBus;
  }) {
    this.storage = opts.storage;
    this.parser = opts.parser ?? new DefaultDocumentParser();
    this.chunker = opts.chunker ?? new DefaultChunkEngine();
    this.indexer = new DefaultKnowledgeIndexer({
      parser: this.parser,
      chunker: this.chunker,
      storage: this.storage,
      logger: opts.logger,
      eventBus: opts.eventBus,
    });
    this.analyzer = new DefaultRepositoryAnalyzer();
    this.logger = opts.logger?.child({ component: 'knowledge' });
    this.eventBus = opts.eventBus;
  }

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const results = await this.storage.search(query, limit);
    await this.eventBus?.emit({
      type: 'knowledge:searched',
      source: 'knowledge-engine',
      payload: { query, results: results.length },
    });
    return results;
  }

  async index(rootDir: string, changedFiles?: string[]): Promise<IndexReport> {
    const report =
      changedFiles && changedFiles.length > 0
        ? await this.indexer.indexFiles(changedFiles, rootDir)
        : await this.indexer.indexDirectory(rootDir);
    await this.eventBus?.emit({
      type: 'knowledge:indexed',
      source: 'knowledge-engine',
      payload: { ...report },
    });

    // Analyze project type after indexing
    const fs = await import('node:fs');
    const path = await import('node:path');
    const rootFiles = fs.readdirSync(rootDir).map((f: string) => path.join(rootDir, f));
    const info = this.analyzer.analyze(rootFiles);
    await this.storage.saveProjectInfo(info as any);

    return report;
  }

  analyze(files: string[]): ProjectInfo {
    return this.analyzer.analyze(files);
  }

  async getStats(): Promise<{ documents: number; chunks: number }> {
    return this.storage.getStats();
  }
}
