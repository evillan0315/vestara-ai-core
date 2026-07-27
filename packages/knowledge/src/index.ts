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

// ═══════════════════════════════════════════════════════════════
// DOCUMENT PARSER
// ═══════════════════════════════════════════════════════════════

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  md: 'markdown',
  txt: 'text',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  ts: 'typescript',
  js: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  py: 'python',
  html: 'html',
  css: 'css',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  dockerfile: 'docker',
  tf: 'terraform',
  toml: 'toml',
  xml: 'xml',
  svg: 'svg',
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  yaml: 'text/yaml',
  ts: 'text/typescript',
  js: 'text/javascript',
  py: 'text/x-python',
  html: 'text/html',
  css: 'text/css',
  sql: 'text/x-sql',
  rs: 'text/rust',
  go: 'text/go',
};

export interface DocumentParser {
  parse(uri: string, content: string): KnowledgeDocument;
  supports(extension: string): boolean;
}

export class DefaultDocumentParser implements DocumentParser {
  parse(uri: string, content: string): KnowledgeDocument {
    const ext = this.getExtension(uri);
    const language = EXTENSION_LANGUAGE_MAP[ext] ?? 'text';
    const mimeType = EXTENSION_MIME_MAP[ext] ?? 'text/plain';
    const title = uri.split('/').pop() ?? uri;

    return {
      id: `doc-${Buffer.from(uri).toString('base64').slice(0, 32)}`,
      uri,
      title,
      language,
      mimeType,
      content,
      metadata: { extension: ext, size: content.length, lines: content.split('\n').length },
      indexedAt: new Date().toISOString(),
    };
  }

  supports(extension: string): boolean {
    return extension in EXTENSION_LANGUAGE_MAP;
  }

  private getExtension(uri: string): string {
    const parts = uri.split('.');
    const ext = parts[parts.length - 1]?.toLowerCase() ?? '';
    // Handle Dockerfile (no extension)
    if (uri.endsWith('Dockerfile') || uri.endsWith('dockerfile')) return 'dockerfile';
    return ext;
  }
}

// ═══════════════════════════════════════════════════════════════
// CHUNK ENGINE
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// STORAGE (SQLite)
// ═══════════════════════════════════════════════════════════════

let SQL: any = null;

async function _getSql(): Promise<any> {
  if (SQL) return SQL;
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
  return SQL;
}

function dbRun(db: any, sql: string, params?: any[]): void {
  const s = db.prepare(sql);
  if (params) s.bind(params);
  s.step();
  s.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const s = db.prepare(sql);
  if (params) s.bind(params);
  const r = s.step() ? s.getAsObject() : null;
  s.free();
  return r;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const r: any[] = [];
  const s = db.prepare(sql);
  if (params) s.bind(params);
  while (s.step()) r.push(s.getAsObject());
  s.free();
  return r;
}

export class KnowledgeStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, uri TEXT UNIQUE, title TEXT,
        language TEXT, mime_type TEXT, content TEXT,
        metadata TEXT DEFAULT '{}', indexed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, document_id TEXT, content TEXT,
        start_line INTEGER, end_line INTEGER
      );
      CREATE TABLE IF NOT EXISTS project_info (
        key TEXT PRIMARY KEY, value TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
    `);
  }

  async saveDocument(doc: KnowledgeDocument): Promise<void> {
    dbRun(this.db, 'INSERT OR REPLACE INTO documents VALUES (?,?,?,?,?,?,?,?)', [
      doc.id,
      doc.uri,
      doc.title,
      doc.language,
      doc.mimeType,
      doc.content,
      JSON.stringify(doc.metadata),
      doc.indexedAt ?? null,
    ]);
  }

  /**
   * Bulk save documents and chunks in a single transaction.
   * Significantly faster than individual saveDocument + saveChunks calls.
   */
  async bulkSave(docs: KnowledgeDocument[], allChunks: KnowledgeChunk[][]): Promise<void> {
    if (docs.length === 0) return;

    // Optimize SQLite for bulk insert
    this.db.exec('PRAGMA synchronous = OFF');
    this.db.exec('PRAGMA journal_mode = MEMORY');
    this.db.exec('BEGIN TRANSACTION');

    try {
      const docStmt = this.db.prepare('INSERT OR REPLACE INTO documents VALUES (?,?,?,?,?,?,?,?)');
      const chunkStmt = this.db.prepare('INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?)');

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        docStmt.bind([
          doc.id,
          doc.uri,
          doc.title,
          doc.language,
          doc.mimeType,
          doc.content,
          JSON.stringify(doc.metadata),
          doc.indexedAt ?? null,
        ]);
        docStmt.step();
        docStmt.reset();

        const chunks = allChunks[i] ?? [];
        for (const c of chunks) {
          chunkStmt.bind([c.id, c.documentId, c.content, c.startLine, c.endLine]);
          chunkStmt.step();
          chunkStmt.reset();
        }
      }

      docStmt.free();
      chunkStmt.free();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      // Restore safe settings
      this.db.exec('PRAGMA synchronous = FULL');
      this.db.exec('PRAGMA journal_mode = DELETE');
    }
  }

  async saveChunks(chunks: KnowledgeChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    // Batch INSERT for efficiency
    const placeholders = chunks.map(() => '(?,?,?,?,?)').join(',');
    const values: any[] = [];
    for (const c of chunks) {
      values.push(c.id, c.documentId, c.content, c.startLine, c.endLine);
    }
    const sql = `INSERT OR REPLACE INTO chunks VALUES ${placeholders}`;
    // Use exec for multi-row insert
    const stmt = this.db.prepare(sql);
    stmt.bind(values);
    stmt.step();
    stmt.free();
  }

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const term = `%${query}%`;
    const docs = dbAll(
      this.db,
      `SELECT DISTINCT d.* FROM documents d WHERE d.content LIKE ? OR d.title LIKE ?
       LIMIT ?`,
      [term, term, limit],
    );
    return docs.map((d: any) => {
      const chunks = dbAll(this.db, 'SELECT * FROM chunks WHERE document_id = ? LIMIT 5', [d.id]);
      return {
        document: this.rowToDoc(d),
        chunks: chunks.map((c: any) => ({
          id: c.id,
          documentId: c.document_id,
          content: c.content,
          startLine: c.start_line,
          endLine: c.end_line,
        })),
        score: 1.0,
      };
    });
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const r = dbGet(this.db, 'SELECT * FROM documents WHERE id = ?', [id]);
    return r ? this.rowToDoc(r) : null;
  }

  async getDocumentByUri(uri: string): Promise<KnowledgeDocument | null> {
    const r = dbGet(this.db, 'SELECT * FROM documents WHERE uri = ?', [uri]);
    return r ? this.rowToDoc(r) : null;
  }

  async deleteDocument(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM chunks WHERE document_id = ?', [id]);
    dbRun(this.db, 'DELETE FROM documents WHERE id = ?', [id]);
  }

  async getStats(): Promise<{ documents: number; chunks: number }> {
    const docs = dbGet(this.db, 'SELECT COUNT(*) as c FROM documents')?.c ?? 0;
    const chunks = dbGet(this.db, 'SELECT COUNT(*) as c FROM chunks')?.c ?? 0;
    return { documents: docs, chunks };
  }

  async saveProjectInfo(info: Record<string, string>): Promise<void> {
    for (const [k, v] of Object.entries(info)) {
      dbRun(this.db, 'INSERT OR REPLACE INTO project_info VALUES (?,?)', [k, v]);
    }
  }

  async getProjectInfo(): Promise<Record<string, string>> {
    const rows = dbAll(this.db, 'SELECT key, value FROM project_info');
    const r: Record<string, string> = {};
    for (const row of rows) r[row.key] = row.value;
    return r;
  }

  private rowToDoc(r: any): KnowledgeDocument {
    return {
      id: r.id,
      uri: r.uri,
      title: r.title,
      language: r.language,
      mimeType: r.mime_type,
      content: r.content,
      metadata: JSON.parse(r.metadata ?? '{}'),
      indexedAt: r.indexed_at,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// REPOSITORY INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

export interface RepositoryAnalyzer {
  analyze(files: string[]): ProjectInfo;
}

export class DefaultRepositoryAnalyzer implements RepositoryAnalyzer {
  analyze(files: string[]): ProjectInfo {
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    const info: ProjectInfo = {
      type: 'unknown',
      language: 'unknown',
      fileCount: files.length,
      totalSizeKB: 0,
      hasDocker: fileSet.has('dockerfile') || fileSet.has('docker-compose.yml'),
      hasCI: fileSet.has('.github/workflows') || fileSet.has('.gitlab-ci.yml'),
      isMonorepo: fileSet.has('pnpm-workspace.yaml') || fileSet.has('lerna.json') || fileSet.has('nx.json'),
    };

    // Detect project type
    if (fileSet.has('package.json')) {
      if (fileSet.has('tsconfig.json')) {
        if (fileSet.has('next.config.js') || fileSet.has('next.config.ts')) {
          info.type = 'next.js';
          info.language = 'typescript';
          info.framework = 'next.js';
        } else if (fileSet.has('vite.config.ts') || fileSet.has('vite.config.js')) {
          info.type = 'vite';
          info.language = 'typescript';
          info.framework = 'vite';
          info.buildTool = 'vite';
        } else if (fileSet.has('turbo.json')) {
          info.type = 'turborepo';
          info.language = 'typescript';
          info.isMonorepo = true;
          info.buildTool = 'turborepo';
        } else {
          info.type = 'node';
          info.language = 'typescript';
        }
      } else {
        info.type = 'node';
        info.language = 'javascript';
      }
      info.packageManager = fileSet.has('pnpm-lock.yaml') ? 'pnpm' : fileSet.has('yarn.lock') ? 'yarn' : 'npm';
      info.testFramework = fileSet.has('vitest.config.ts')
        ? 'vitest'
        : fileSet.has('jest.config.ts')
          ? 'jest'
          : undefined;
    } else if (fileSet.has('go.mod')) {
      info.type = 'go';
      info.language = 'go';
    } else if (fileSet.has('Cargo.toml')) {
      info.type = 'rust';
      info.language = 'rust';
    } else if (fileSet.has('setup.py') || fileSet.has('pyproject.toml')) {
      info.type = 'python';
      info.language = 'python';
    } else if (fileSet.has('Gemfile')) {
      info.type = 'ruby';
      info.language = 'ruby';
    }

    if (fileSet.has('docker-compose.yml') || fileSet.has('docker-compose.yaml')) info.hasDocker = true;
    if (fileSet.has('.github/') || files.some((f) => f.startsWith('.github/'))) info.hasCI = true;

    return info;
  }
}

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

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE ENGINE (Orchestrator)
// ═══════════════════════════════════════════════════════════════

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
