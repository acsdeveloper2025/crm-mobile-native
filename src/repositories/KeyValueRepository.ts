import { DatabaseService } from '../database/DatabaseService';

class KeyValueRepositoryClass {
  isReady(): boolean {
    return DatabaseService.isReady();
  }

  async get(key: string): Promise<string | null> {
    const rows = await DatabaseService.query<{ value: string }>(
      'SELECT value FROM key_value_store WHERE key = ?',
      [key],
    );
    return rows[0]?.value || null;
  }

  async set(key: string, value: string): Promise<void> {
    await DatabaseService.execute(
      'INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)',
      [key, value],
    );
  }

  async remove(key: string): Promise<void> {
    await DatabaseService.execute(
      'DELETE FROM key_value_store WHERE key = ?',
      [key],
    );
  }

  async removeLike(pattern: string): Promise<void> {
    await DatabaseService.execute(
      'DELETE FROM key_value_store WHERE key LIKE ?',
      [pattern],
    );
  }
}

export const KeyValueRepository = new KeyValueRepositoryClass();
