// DatabaseService - SQLite CRUD operations and lifecycle management
// This is the single entry point for all local data operations

import SQLite, {
  SQLiteDatabase,
  ResultSet,
} from 'react-native-sqlite-storage';
import { config } from '../config';
import { SCHEMA_SQL, INDEX_SQL, MIGRATIONS, DB_VERSION } from './schema';
import { Logger } from '../utils/logger';

// Enable promise-based API
SQLite.enablePromise(true);

class DatabaseServiceClass {
  private db: SQLiteDatabase | null = null;
  private initialized = false;

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
   * Initialize the database connection, create tables and run migrations.
   * Must be called once at app startup before any data operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      Logger.info('DatabaseService', 'Initializing database...');

      this.db = await SQLite.openDatabase({
        name: config.dbName,
        location: 'default',
      });

      // Encryption: When using react-native-sqlcipher-storage, set the key
      // before any other PRAGMA. The key is derived from the device keychain
      // so it's unique per installation and not stored in plaintext.
      if (config.dbEncryptionKey) {
        await this.db.executeSql(`PRAGMA key = '${config.dbEncryptionKey}';`);
        Logger.info('DatabaseService', 'Database encryption enabled');
      }

      // Enable WAL mode for better concurrent read/write performance
      await this.db.executeSql('PRAGMA journal_mode = WAL;');
      // FULL synchronous ensures data survives device crashes during WAL checkpoints
      await this.db.executeSql('PRAGMA synchronous = FULL;');
      // Enable foreign keys
      await this.db.executeSql('PRAGMA foreign_keys = ON;');

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

      // Run migrations
      await this.runMigrations();

      this.initialized = true;
      Logger.info('DatabaseService', 'Database initialized successfully');
    } catch (error) {
      Logger.error('DatabaseService', 'Failed to initialize database', error);
      throw error;
    }
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
    const currentVersion = result.rows.item(0).user_version || 0;

    Logger.info('DatabaseService', `Current DB version: ${currentVersion}, target: ${DB_VERSION}`);

    if (currentVersion === 0) {
      await this.db.executeSql(`PRAGMA user_version = ${DB_VERSION};`);
      return;
    }

    // Apply pending migrations — each migration runs inside a transaction so a
    // crash mid-migration doesn't leave the schema in a half-applied state.
    const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
    for (const migration of pendingMigrations) {
      Logger.info('DatabaseService', `Running migration v${migration.version}: ${migration.description}`);
      const migrationStatements = migration.sql.split(';').filter(s => s.trim().length > 0);
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
          Logger.error('DatabaseService', `Migration v${migration.version} rollback failed`, rollbackError);
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
        Logger.error('DatabaseService', 'Transaction rollback failed', rollbackError);
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

  /** Whitelist of known table names to prevent SQL injection via dynamic table refs */
  private static readonly ALLOWED_TABLES = new Set([
    'tasks', 'attachments', 'locations', 'form_submissions', 'form_templates',
    'sync_queue', 'sync_metadata', 'user_session', 'audit_log', 'notifications',
    'key_value_store', 'task_list_projection', 'task_detail_projection',
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
