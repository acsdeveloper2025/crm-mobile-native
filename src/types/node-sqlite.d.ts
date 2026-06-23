// Minimal ambient types for node:sqlite — Node's built-in synchronous SQLite,
// used ONLY by the runner-free contract tests (run via `node
// --experimental-strip-types`). The RN tsconfig has no @types/node, so we
// declare just the surface the contract tests use. See
// https://nodejs.org/api/sqlite.html for the full API.

declare module 'node:sqlite' {
  interface StatementSync {
    all(...params: unknown[]): Array<Record<string, unknown>>;
    run(...params: unknown[]): unknown;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
