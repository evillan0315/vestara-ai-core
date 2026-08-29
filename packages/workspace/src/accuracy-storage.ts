import { migrate } from '@vestara/sqlite-migrations';
import { ACCURACY_MANIFEST } from './scaffold-migrations';
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
    migrate(this.db, ACCURACY_MANIFEST);
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
