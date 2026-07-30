export function dbRun(db: any, sql: string, params?: any[]): void {
  try {
    if (params) db.run(sql, params);
    else db.run(sql);
  } catch (err) {
    console.error('[knowledge] dbRun error:', err);
    throw err;
  }
}

export function dbGet(db: any, sql: string, params?: any[]): any {
  try {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const r = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return r;
  } catch (err) {
    return null;
  }
}

export function dbAll(db: any, sql: string, params?: any[]): any[] {
  try {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (err) {
    console.error('[knowledge] dbAll error:', err);
    return [];
  }
}
