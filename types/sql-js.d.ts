/**
 * Ambient declarations for `sql.js`, which ships without bundled TypeScript
 * types. Packages across the monorepo use sql.js (WASM SQLite) for in-memory
 * stores; this shim gives them a structural `Database` / `Statement` surface.
 */

declare module 'sql.js' {
  export type SqlValue = number | bigint | string | Uint8Array | null;

  export interface Statement {
    bind(params: readonly SqlValue[]): boolean;
    step(): boolean;
    get(): unknown[];
    getAsObject(): Record<string, unknown>;
    free(): boolean;
    reset(): boolean;
  }

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Database {
    run(sql: string, params?: readonly SqlValue[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string, params?: readonly SqlValue[]): Statement;
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
    [key: string]: unknown;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | Buffer | null) => Database;
    Statement: new () => Statement;
  }

  export function locateFile(file: string): string;

  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
