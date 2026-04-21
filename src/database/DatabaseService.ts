// DatabaseService - SQLite CRUD operations and lifecycle management
// This is the single entry point for all local data operations

import SQLite, { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import { config } from '../config';
import { SCHEMA_SQL, INDEX_SQL, MIGRATIONS, DB_VERSION } from './schema';
import { Logger } from '../utils/logger';
import { DatabaseKeyStore } from '../services/DatabaseKeyStore';

// Enable promise-based API
SQLite.enablePromise(true);

class DatabaseServiceClass {
  private db: SQLiteDatabase | null = null;
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
      if (DatabaseServiceClass.isCorruptionError(error)) {
        // SQLITE_CORRUPT[11] ("database disk image is malformed") here
        // is almost always an encryption-key / DB-file pair mismatch,
        // not a real on-disk corruption. Common trigger on Samsung:
        // Smart Switch restores the app's `databases/` directory from
        // a backup but not the Keychain entry, so a fresh key pairs
        // with a ciphertext it can't decrypt. The local DB is just a
        // cache of server-side data, so deleting it and retrying with
        // a fresh key is a safe, user-invisible recovery. Retry once.
        Logger.warn(
          'DatabaseService',
          'Database appears corrupt or keyed with a stale encryption key; deleting and retrying',
          { error },
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
              keyErr,
            );
            throw keyErr;
          }
        }
        await this.openAndSetup(options);
        Logger.info(
          'DatabaseService',
          'Database recreated after corruption recovery',
        );
      } else {
        Logger.error(
          'DatabaseService',
          'Failed to initialize database',
          error,
        );
        throw error;
      }
    }
  }

  private static isCorruptionError(error: unknown): boolean {
    const msg = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return (
      msg.includes('disk image is malformed') ||
      msg.includes('sqlite_corrupt') ||
      msg.includes('file is not a database') ||
      msg.includes('file is encrypted') // SQLCipher wrong-key shape
    );
  }

  private async safeCloseDb(): Promise<void> {
    if (!this.db) {
      return;
    }
    try {
      await this.db.close();
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
    try {
      await SQLite.deleteDatabase({
        name: config.dbName,
        location: 'default',
      });
      Logger.info('DatabaseService', 'Deleted local DB file for recovery');
    } catch (err) {
      // Not fatal — the subsequent openDatabase call will create fresh
      // files anyway when the old ones are unreadable. Log so ops can
      // track this if it happens repeatedly.
      Logger.warn(
        'DatabaseService',
        'SQLite.deleteDatabase failed during recovery; proceeding with retry',
        err,
      );
    }
  }

  private async openAndSetup(options: {
    deferMigrations?: boolean;
  }): Promise<void> {
    Logger.info('DatabaseService', 'Initializing database...');

    this.db = await SQLite.openDatabase({
      name: config.dbName,
      location: 'default',
    });

    // Encryption: When using react-native-sqlcipher-storage, set the key
    // before any other PRAGMA. The key is derived from the device keychain
    // so it's unique per installation and not stored in plaintext.
    //
    // Safety:
    //  - The key must be a 64-character hex string (256 bits). Any other
    //    format is rejected to prevent SQL injection via PRAGMA interpolation.
    //  - In release builds (__DEV__ === false) a key is REQUIRED; starting
    //    an unencrypted DB in production is a hard failure.
    const encryptionKey = config.dbEncryptionKey;
    if (encryptionKey) {
      if (!DatabaseServiceClass.isValidEncryptionKey(encryptionKey)) {
        throw new Error(
          'Invalid database encryption key format (expected 64-char hex string)',
        );
      }
      await this.db.executeSql(`PRAGMA key = "x'${encryptionKey}'";`);
      // Touch the schema_version page now so a wrong-key pairing surfaces
      // as SQLITE_CORRUPT here (where the recovery path can catch it)
      // rather than on the first real query much later in boot.
      await this.db.executeSql('SELECT count(*) FROM sqlite_master;');
      Logger.info('DatabaseService', 'Database encryption enabled');
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

    // Enable WAL mode for better concurrent read/write performance
    await this.db.executeSql('PRAGMA journal_mode = WAL;');
    // FULL synchronous ensures data survives device crashes during WAL checkpoints
    await this.db.executeSql('PRAGMA synchronous = FULL;');
    // Enable foreign keys
    await this.db.executeSql('PRAGMA foreign_keys = ON;');
    // S4 (audit 2026-04-21 round 2): zero deleted pages rather than
    // marking them free. Without this, legacy token bytes scrubbed by
    // `UserSessionRepository.scrubLegacyTokens` remain readable in the
    // `-wal` file until the next checkpoint + VACUUM. With
    // `secure_delete = ON`, every DELETE/UPDATE zeros the overwritten
    // region so forensic recovery of prior-token ciphertext is blocked.
    await this.db.executeSql('PRAGMA secure_delete = ON;');

    // Create tables
    const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
    for (const statement of statements) {
      await this.db.executeSql(statement + ';');
    }

    // Create indexes
    const indexes = INDEX_SQL.split(';').filter(s => s.trim().length > 0);
    for (const index of indexes) {
      await this.db.executeSql(index + ';');
    }

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

    // Get current schema version
    const [result] = await this.db.executeSql('PRAGMA user_version;');
    const currentVersion = result.rows.item(0).userVersion || 0;

    Logger.info(
      'DatabaseService',
      `Current DB version: ${currentVersion}, target: ${DB_VERSION}`,
    );

    if (currentVersion === 0) {
      await this.db.executeSql(`PRAGMA user_version = ${DB_VERSION};`);
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
      await this.db.executeSql('BEGIN TRANSACTION;');
      try {
        for (const stmt of migrationStatements) {
          await this.db.executeSql(stmt + ';');
        }
        await this.db.executeSql(`PRAGMA user_version = ${migration.version};`);
        await this.db.executeSql('COMMIT;');
      } catch (migrationError) {
        try {
          await this.db.executeSql('ROLLBACK;');
        } catch (rollbackError) {
          Logger.error(
            'DatabaseService',
            `Migration v${migration.version} rollback failed`,
            rollbackError,
          );
        }
        throw migrationError;
      }
    }

    // Update schema version to DB_VERSION if no migrations ran but version is behind
    if (pendingMigrations.length === 0 && currentVersion < DB_VERSION) {
      await this.db.executeSql(`PRAGMA user_version = ${DB_VERSION};`);
    }
  }

  /**
   * Get the database instance. Throws if not initialized.
   */
  getDb(): SQLiteDatabase {
    if (!this.db || !this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a SQL query with parameters and return results
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: (string | number | null)[] = [],
  ): Promise<T[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(sql, params);
    return this.resultSetToArray<T>(result);
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE) with parameters
   * Returns the number of rows affected
   */
  async execute(
    sql: string,
    params: (string | number | null)[] = [],
  ): Promise<{ rowsAffected: number; insertId?: number }> {
    const db = this.getDb();
    const [result] = await db.executeSql(sql, params);
    return {
      rowsAffected: result.rowsAffected,
      insertId: result.insertId,
    };
  }

  /**
   * Execute multiple statements in a transaction
   * If any statement fails, all changes are rolled back
   */
  async transaction(
    operations: (tx: SQLiteDatabase) => Promise<void>,
  ): Promise<void> {
    const db = this.getDb();
    await db.executeSql('BEGIN TRANSACTION;');
    try {
      await operations(db);
      await db.executeSql('COMMIT;');
    } catch (error) {
      try {
        await db.executeSql('ROLLBACK;');
      } catch (rollbackError) {
        Logger.error(
          'DatabaseService',
          'Transaction rollback failed',
          rollbackError,
        );
      }
      throw error;
    }
  }

  /**
   * Convert a ResultSet from SQLite into an array of typed objects
   */
  private resultSetToArray<T>(result: ResultSet): T[] {
    const rows: T[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i) as Record<string, unknown>;
      rows.push(this.normalizeRow<T>(row));
    }
    return rows;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
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
   * Validate a SQLCipher encryption key. Must be a 64-character lowercase-or-
   * uppercase hex string (256 bits of entropy). Rejecting anything else
   * prevents PRAGMA-injection via an attacker-controlled key source.
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
    params?: (string | number | null)[],
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
