import { dbAll, dbGet, dbRun } from '../db.js';
import type { KnowledgeChunk, KnowledgeDocument, SearchResult } from '../types/index.js';

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
