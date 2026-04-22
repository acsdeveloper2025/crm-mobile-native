// DatabaseService - SQLite CRUD operations and lifecycle management
// This is the single entry point for all local data operations.
//
// v1.0.5: backed directly by @op-engineering/op-sqlite built with
// SQLCipher 4.6+ (see package.json "op-sqlite": { "sqlcipher": true }).
// Encryption is applied at open-time via the `encryptionKey` parameter —
// no more `PRAGMA key` which (a) was silently ignored on the previous
// plugin (unencrypted DB in every OEM) and (b) triggered Samsung Knox's
// Protected Module false-positive HMAC check on Samsung devices causing
// SQLITE_CORRUPT on every launch.
//
// There is NO compat shim anymore. The public surface of DatabaseService
// (query, execute, transaction, getDb, count, close, ...) is unchanged,
// but callers receive op-sqlite's native types: a `Transaction` exposes
// `.execute(sql, params)` and `QueryResult.rows` is a plain array. The
// old `.executeSql()` / `.rows.item(i)` / `.rows.raw()` / array-wrapped
// result shape from react-native-sqlite-storage is gone.

import {
  open,
  type DB,
  type QueryResult,
  type Transaction,
} from '@op-engineering/op-sqlite';
import RNFS from 'react-native-fs';
import { config } from '../config';
import { SCHEMA_SQL, INDEX_SQL, MIGRATIONS, DB_VERSION } from './schema';
import { Logger } from '../utils/logger';
import { DatabaseKeyStore } from '../services/DatabaseKeyStore';

/**
 * Re-exported op-sqlite types so repositories can annotate their own
 * transaction callbacks without importing op-sqlite directly. That keeps
 * the dependency surface narrow: DatabaseService is the only file that
 * speaks to op-sqlite.
 */
export type { DB, QueryResult, Transaction };

type SqlParam = string | number | null;

class DatabaseServiceClass {
  private db: DB | null = null;
  private initialized = false;
  // Phase C4: migrations can run deferred. This promise is set by
  // initialize() and resolved either synchronously (if called without
  // `deferMigrations`) or by runPendingMigrations() when the caller
  // explicitly triggers the background migration pass.
  private migrationsReady: Promise<void> = Promise.resolve();
  private migrationsStarted = false;

  private toCamelCase(key: string): string {
    return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  }

  private normalizeRow<T>(row: Record<string, unknown>): T {
    const normalized: Record<string, unknown> = { ...row };

    Object.entries(row).forEach(([key, value]) => {
      const camelKey = this.toCamelCase(key);
      if (camelKey !== key && !(camelKey in normalized)) {
        normalized[camelKey] = value;
      }
    });

    return normalized as T;
  }

  /**
   * Initialize the database connection, create tables, and optionally run
   * migrations.
   *
   * `options.deferMigrations` (Phase C4) lets the caller split migration
   * work off the critical path:
   *
   *   - false (default): migrations run inline before the promise
   *     resolves. Safe default; behavior matches pre-C4.
   *   - true: the method returns as soon as the schema is opened and
   *     CREATE IF NOT EXISTS / indexes have run. Pending migrations are
   *     NOT applied until runPendingMigrations() is called explicitly.
   *     Callers that need migrated schema (anything reading the v8+
   *     projection tables, in-progress task uploads, etc.) should
   *     `await DatabaseService.awaitMigrationsReady()` before touching
   *     the DB. Cheap initial paths (login, session restore) can skip
   *     the wait and interact with the v1-compatible subset.
   *
   * CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS are
   * idempotent, so running them on every startup is cheap (< 100ms on
   * a cold DB). The heavy work — ALTER TABLE and data-copying
   * migrations — is what benefits from deferral.
   */
  async initialize(options: { deferMigrations?: boolean } = {}): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.openAndSetup(options);
    } catch (error) {
      // 2026-04-21 v1.0.4: ALWAYS attempt recovery on init failure.
      //
      // The v1.0.3 attempt at a Samsung-specific fix used an
      // `isCorruptionError(error)` guard that inspected `error.message`.
      // But the old plugin sometimes threw a plain object `{ code, message }`
      // rather than an Error, the matcher missed, and recovery never
      // fired. Since the local DB is a cache of server-side data, the
      // recovery is non-destructive (next sync refills). Running it
      // unconditionally on ANY init failure is strictly safer than
      // skipping it due to an error-shape mismatch. The full error
      // shape is dumped below so future regressions can be debugged
      // from a single logcat line.
      //
      // v1.0.5 dual use: this same path now performs the one-time
      // migration from v1.0.4's plaintext DB to v1.0.5's SQLCipher-
      // encrypted DB. Opening a plaintext file with an encryption key
      // fails at the first query ("file is not a database"); the
      // catch wipes it and openAndSetup recreates a fresh encrypted DB.
      Logger.warn(
        'DatabaseService',
        'Initial DB open failed; attempting corruption recovery',
        DatabaseServiceClass.describeError(error),
      );

      await this.safeCloseDb();
      await this.deleteLocalDbFile();
      await DatabaseKeyStore.reset().catch(() => {
        /* non-fatal — see DatabaseKeyStore.reset comment */
      });
      // Mint a fresh key for the clean DB we're about to create. App.tsx
      // set config.dbEncryptionKey on boot; replace it so the retry
      // uses the new one.
      if (!__DEV__) {
        try {
          config.dbEncryptionKey = await DatabaseKeyStore.getOrCreateKey();
        } catch (keyErr) {
          Logger.error(
            'DatabaseService',
            'Failed to regenerate encryption key during corruption recovery',
            DatabaseServiceClass.describeError(keyErr),
          );
          throw keyErr;
        }
      }

      try {
        await this.openAndSetup(options);
        Logger.info(
          'DatabaseService',
          'Database recreated after corruption recovery',
        );
      } catch (retryErr) {
        // Recovery itself failed. Surface the ORIGINAL error too so
        // the user / ops can see both sides.
        Logger.error(
          'DatabaseService',
          'Corruption recovery retry also failed',
          {
            original: DatabaseServiceClass.describeError(error),
            retry: DatabaseServiceClass.describeError(retryErr),
          },
        );
        throw retryErr;
      }
    }
  }

  /**
   * Collect every useful property from an unknown error shape into a
   * serializable object the logger can render. op-sqlite throws proper
   * Error instances, but keep the object-shape branch as defense for
   * any future plugin change or wrapped rejection.
   */
  private static describeError(err: unknown): Record<string, unknown> {
    if (err == null) {
      return { kind: 'null' };
    }
    if (err instanceof Error) {
      return {
        kind: 'Error',
        name: err.name,
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 5).join('\n'),
      };
    }
    if (typeof err === 'object') {
      const o = err as Record<string, unknown>;
      return {
        kind: 'object',
        code: o.code,
        errno: o.errno,
        message: o.message,
        sqliteError: o.sqliteError,
        keys: Object.keys(o),
      };
    }
    return { kind: typeof err, value: String(err) };
  }

  private async safeCloseDb(): Promise<void> {
    if (!this.db) {
      return;
    }
    try {
      this.db.close();
    } catch (err) {
      Logger.warn(
        'DatabaseService',
        'Failed to close DB before corruption recovery; continuing',
        err,
      );
    }
    this.db = null;
    this.initialized = false;
  }

  private async deleteLocalDbFile(): Promise<void> {
    // op-sqlite exposes `db.delete()` but requires an open handle; our
    // recovery path has already closed / never opened. Instead, unlink the
    // files directly via RNFS. op-sqlite uses the standard Android
    // `/data/data/<pkg>/databases/` location identical to the old plugin,
    // so the paths computed below still apply.
    //
    // Belt-and-braces file-level delete of the DB + its WAL + SHM sidecars
    // (kept from v1.0.3). On some Samsung devices the plugin's own delete
    // reports success while leaving `-wal` / `-shm` sidecars behind, so
    // the next open re-attached the corrupt state. RNFS.unlink is
    // idempotent and survives that quirk.
    const candidates = [
      `${RNFS.DocumentDirectoryPath}/../databases/${config.dbName}`,
      `${RNFS.DocumentDirectoryPath}/../databases/${config.dbName}-wal`,
      `${RNFS.DocumentDirectoryPath}/../databases/${config.dbName}-shm`,
      `${RNFS.DocumentDirectoryPath}/../databases/${config.dbName}-journal`,
    ];
    let unlinked = 0;
    for (const path of candidates) {
      try {
        if (await RNFS.exists(path)) {
          await RNFS.unlink(path);
          unlinked++;
          Logger.info('DatabaseService', `Unlinked stale DB file: ${path}`);
        }
      } catch (err) {
        // Per-file failures are non-fatal; the next open will still
        // work because the main .db file has been removed or SQLite's
        // own path will re-create fresh.
        Logger.warn(
          'DatabaseService',
          `RNFS.unlink failed for ${path}; continuing`,
          err,
        );
      }
    }

    Logger.info(
      'DatabaseService',
      `DB file cleanup complete (${unlinked} files unlinked)`,
    );
  }

  private async openAndSetup(options: {
    deferMigrations?: boolean;
  }): Promise<void> {
    Logger.info('DatabaseService', 'Initializing database...');

    // Encryption: op-sqlite is compiled with SQLCipher (see package.json
    // "op-sqlite": { "sqlcipher": true }). Passing `encryptionKey` at open
    // time transparently encrypts every on-disk page with AES-256; there
    // is no separate PRAGMA key step and none is needed.
    //
    // Safety:
    //  - The key must be a 64-character hex string (256 bits). Any other
    //    format is rejected so a malformed Keychain entry can't silently
    //    produce a weak key.
    //  - In release builds (__DEV__ === false) a key is REQUIRED.
    //  - Dev builds without a key start unencrypted — useful for devtools
    //    that inspect the raw DB file on the simulator.
    const encryptionKey = config.dbEncryptionKey;
    if (encryptionKey) {
      if (!DatabaseServiceClass.isValidEncryptionKey(encryptionKey)) {
        throw new Error(
          'Invalid database encryption key format (expected 64-char hex string)',
        );
      }
    } else if (!__DEV__) {
      throw new Error(
        'Database encryption key is required in production builds. ' +
          'Set config.dbEncryptionKey from the Keychain before initialize().',
      );
    } else {
      Logger.warn(
        'DatabaseService',
        'Starting database WITHOUT encryption (development build)',
      );
    }

    // op-sqlite's `open` is synchronous. It returns immediately with a
    // DB handle bound to the file — actual SQLCipher key verification
    // happens on the first query, which is why the sanity-SELECT below
    // is critical for catching a wrong-key pairing (or a leftover
    // plaintext DB from v1.0.4) at init time rather than deep into boot.
    this.db = open({
      name: config.dbName,
      encryptionKey: encryptionKey ?? undefined,
    });

    // Touch the schema page now. A wrong key or a legacy plaintext file
    // surfaces here as "file is not a database" / SQLITE_NOTADB, which
    // the catch in initialize() will absorb into the recovery path.
    await this.db.execute('SELECT count(*) FROM sqlite_master;');
    if (encryptionKey) {
      Logger.info('DatabaseService', 'Database encryption enabled (SQLCipher)');
    }

    // Enable WAL mode for better concurrent read/write performance
    await this.db.execute('PRAGMA journal_mode = WAL;');
    // FULL synchronous ensures data survives device crashes during WAL checkpoints
    await this.db.execute('PRAGMA synchronous = FULL;');
    // Enable foreign keys
    await this.db.execute('PRAGMA foreign_keys = ON;');
    // S4 (audit 2026-04-21 round 2): zero deleted pages rather than
    // marking them free. Without this, legacy token bytes scrubbed by
    // `UserSessionRepository.scrubLegacyTokens` remain readable in the
    // `-wal` file until the next checkpoint + VACUUM. With
    // `secure_delete = ON`, every DELETE/UPDATE zeros the overwritten
    // region so forensic recovery of prior-token ciphertext is blocked.
    // On SQLCipher this is additionally important because a decrypted
    // page in memory is still sensitive; zeroing avoids any cipher
    // ambiguity on the freed page.
    await this.db.execute('PRAGMA secure_delete = ON;');

    // DB5 (audit 2026-04-21 round 2): wrap CREATE TABLE + CREATE INDEX
    // setup in a single transaction. A transient SQLite I/O error
    // mid-loop would otherwise leave the DB with a partial schema
    // (fewer indexes than expected), which the next open would silently
    // accept. Atomic setup means we either have the full schema or
    // roll all the way back.
    const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
    const indexes = INDEX_SQL.split(';').filter(s => s.trim().length > 0);
    await this.db.transaction(async tx => {
      for (const statement of statements) {
        await tx.execute(statement + ';');
      }
      for (const index of indexes) {
        await tx.execute(index + ';');
      }
    });

    // Mark the DB usable *before* the potentially slow migration pass.
    // Callers that don't need migrated schema can proceed immediately.
    this.initialized = true;

    if (options.deferMigrations) {
      Logger.info('DatabaseService', 'Database opened; migrations deferred');
      // Caller is responsible for invoking runPendingMigrations().
      // The migrationsReady promise stays pending until then.
      this.migrationsReady = new Promise<void>((resolve, reject) => {
        this.deferredMigrationResolve = resolve;
        this.deferredMigrationReject = reject;
      });
      return;
    }

    await this.runMigrations();
    Logger.info('DatabaseService', 'Database initialized successfully');
  }

  private deferredMigrationResolve: (() => void) | null = null;
  private deferredMigrationReject: ((err: unknown) => void) | null = null;

  /**
   * Run any pending migrations that were skipped by
   * initialize({ deferMigrations: true }). Safe to call once; subsequent
   * calls are no-ops because migrationsStarted flips to true on entry.
   */
  async runPendingMigrations(): Promise<void> {
    if (this.migrationsStarted) {
      return this.migrationsReady;
    }
    this.migrationsStarted = true;
    try {
      await this.runMigrations();
      Logger.info('DatabaseService', 'Deferred migrations completed');
      this.deferredMigrationResolve?.();
    } catch (error) {
      Logger.error('DatabaseService', 'Deferred migrations failed', error);
      this.deferredMigrationReject?.(error);
      throw error;
    }
  }

  /**
   * Wait for any pending migrations to finish. Resolves immediately if
   * migrations ran inline or have already completed.
   */
  awaitMigrationsReady(): Promise<void> {
    return this.migrationsReady;
  }

  /**
   * Run any pending database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not opened');
    }

    // Get current schema version. op-sqlite returns column names exactly
    // as SQLite reports them, so `user_version` stays snake_case here.
    const result = await this.db.execute('PRAGMA user_version;');
    const currentVersion =
      (result.rows[0]?.user_version as number | undefined) ?? 0;

    Logger.info(
      'DatabaseService',
      `Current DB version: ${currentVersion}, target: ${DB_VERSION}`,
    );

    if (currentVersion === 0) {
      await this.db.execute(`PRAGMA user_version = ${DB_VERSION};`);
      return;
    }

    // Apply pending migrations — each migration runs inside a transaction so a
    // crash mid-migration doesn't leave the schema in a half-applied state.
    const pendingMigrations = MIGRATIONS.filter(
      m => m.version > currentVersion,
    );
    for (const migration of pendingMigrations) {
      Logger.info(
        'DatabaseService',
        `Running migration v${migration.version}: ${migration.description}`,
      );
      const migrationStatements = migration.sql
        .split(';')
        .filter(s => s.trim().length > 0);
      // op-sqlite's transaction helper handles BEGIN/COMMIT/ROLLBACK
      // automatically — throwing from the callback rolls back.
      await this.db.transaction(async tx => {
        for (const stmt of migrationStatements) {
          await tx.execute(stmt + ';');
        }
        await tx.execute(`PRAGMA user_version = ${migration.version};`);
      });
    }

    // Update schema version to DB_VERSION if no migrations ran but version is behind
    if (pendingMigrations.length === 0 && currentVersion < DB_VERSION) {
      await this.db.execute(`PRAGMA user_version = ${DB_VERSION};`);
    }
  }

  /**
   * Get the database instance. Throws if not initialized.
   */
  getDb(): DB {
    if (!this.db || !this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a SQL query with parameters and return results as typed objects.
   * Column names are automatically camel-cased (snake_case originals are
   * also retained on the row object for legacy reads).
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T[]> {
    const db = this.getDb();
    const result = await db.execute(sql, params);
    return this.resultSetToArray<T>(result);
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE) with parameters.
   * Returns the number of rows affected and the insertId (if any).
   */
  async execute(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<{ rowsAffected: number; insertId?: number }> {
    const db = this.getDb();
    const result = await db.execute(sql, params);
    return {
      rowsAffected: result.rowsAffected,
      insertId: result.insertId,
    };
  }

  /**
   * Execute multiple statements atomically. op-sqlite's built-in
   * `db.transaction` handles BEGIN / COMMIT / ROLLBACK: throwing from
   * the callback triggers a rollback, successful completion commits.
   *
   * The callback receives a `Transaction` with `.execute(sql, params)` —
   * use that instead of `DatabaseService.execute` inside the transaction
   * so writes route through the same transaction context.
   */
  async transaction(
    operations: (tx: Transaction) => Promise<void>,
  ): Promise<void> {
    const db = this.getDb();
    try {
      await db.transaction(async tx => {
        await operations(tx);
      });
    } catch (error) {
      Logger.error('DatabaseService', 'Transaction failed', error);
      throw error;
    }
  }

  /**
   * Convert an op-sqlite QueryResult into an array of typed, camel-cased
   * objects.
   */
  private resultSetToArray<T>(result: QueryResult): T[] {
    const out: T[] = [];
    for (const row of result.rows) {
      out.push(this.normalizeRow<T>(row as Record<string, unknown>));
    }
    return out;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      Logger.info('DatabaseService', 'Database closed');
    }
  }

  /**
   * Check if database is initialized and ready
   */
  isReady(): boolean {
    return this.initialized && this.db !== null;
  }

  /**
   * Validate a SQLCipher encryption key. Must be a 64-character hex
   * string (256 bits of entropy). Rejecting anything else prevents a
   * bad-format key from silently producing a weak cipher.
   */
  private static isValidEncryptionKey(key: string): boolean {
    return /^[A-Fa-f0-9]{64}$/.test(key);
  }

  /** Whitelist of known table names to prevent SQL injection via dynamic table refs */
  private static readonly ALLOWED_TABLES = new Set([
    'tasks',
    'attachments',
    'locations',
    'form_submissions',
    'form_templates',
    'sync_queue',
    'sync_metadata',
    'user_session',
    'audit_log',
    'notifications',
    'key_value_store',
    'task_list_projection',
    'task_detail_projection',
    'dashboard_projection',
  ]);

  private assertTableName(table: string): void {
    if (!DatabaseServiceClass.ALLOWED_TABLES.has(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
  }

  /**
   * Get count of records in a table with optional WHERE clause.
   * Table name is validated against a whitelist to prevent SQL injection.
   */
  async count(
    table: string,
    where?: string,
    params?: SqlParam[],
  ): Promise<number> {
    this.assertTableName(table);
    const sql = where
      ? `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`
      : `SELECT COUNT(*) as count FROM ${table}`;
    const result = await this.query<{ count: number }>(sql, params);
    return result[0]?.count ?? 0;
  }
}

// Singleton instance
export const DatabaseService = new DatabaseServiceClass();
export default DatabaseService;
