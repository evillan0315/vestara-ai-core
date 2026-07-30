import * as path from 'node:path';

let _sql: any = null;
let _initPromise: Promise<any> | null = null;

function getSqlJsDistDir(): string {
  try {
    return path.dirname(require.resolve('sql.js'));
  } catch {
    return path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist');
  }
}

const _sqlJsDistDir = getSqlJsDistDir();

export async function getSql(): Promise<any> {
  if (_sql) return _sql;
  if (!_initPromise) {
    // @ts-expect-error — sql.js has no official types
    const initSqlJs = (await import('sql.js')).default;
    _initPromise = initSqlJs({
      locateFile: (file: string) => path.join(_sqlJsDistDir, file),
    });
  }
  _sql = await _initPromise;
  return _sql;
}

export function dbRun(db: any, sql: string, params?: any[]): void {
  const s = db.prepare(sql);
  if (params) s.bind(params);
  s.step();
  s.free();
}

export function dbGet(db: any, sql: string, params?: any[]): any {
  const s = db.prepare(sql);
  if (params) s.bind(params);
  const r = s.step() ? s.getAsObject() : null;
  s.free();
  return r;
}

export function dbAll(db: any, sql: string, params?: any[]): any[] {
  const r: any[] = [];
  const s = db.prepare(sql);
  if (params) s.bind(params);
  while (s.step()) r.push(s.getAsObject());
  s.free();
  return r;
}
