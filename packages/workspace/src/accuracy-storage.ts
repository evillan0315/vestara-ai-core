import type { PredictionAccuracy } from './types';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export class AccuracyStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prediction_accuracy (
        id TEXT PRIMARY KEY,
        assessment_id TEXT,
        change_set_id TEXT,
        verification_id TEXT,
        predicted_health_delta REAL,
        actual_health_delta REAL,
        error REAL,
        absolute_error REAL,
        recorded_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pa_assessment ON prediction_accuracy(assessment_id);
    `);
  }

  async save(pa: PredictionAccuracy): Promise<void> {
    dbRun(
      this.db,
      `INSERT INTO prediction_accuracy
       (id, assessment_id, change_set_id, verification_id,
        predicted_health_delta, actual_health_delta, error, absolute_error, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pa.id,
        pa.assessmentId,
        pa.changeSetId,
        pa.verificationId,
        pa.predictedHealthDelta,
        pa.actualHealthDelta,
        pa.error,
        pa.absoluteError,
        pa.recordedAt,
      ],
    );
  }

  async list(): Promise<PredictionAccuracy[]> {
    return dbAll(this.db, 'SELECT * FROM prediction_accuracy ORDER BY recorded_at DESC');
  }

  async getAverageError(): Promise<number> {
    const rows = dbAll(this.db, 'SELECT AVG(absolute_error) as avg FROM prediction_accuracy');
    return rows[0]?.avg ?? 0;
  }
}
