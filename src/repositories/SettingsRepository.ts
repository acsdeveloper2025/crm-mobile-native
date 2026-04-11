import { DatabaseService } from '../database/DatabaseService';

class SettingsRepositoryClass {
  async getValue(key: string): Promise<string | null> {
    const rows = await DatabaseService.query<{ value: string }>(
      'SELECT value FROM key_value_store WHERE key = ?',
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async setValue(key: string, value: string): Promise<void> {
    await DatabaseService.execute(
      'INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)',
      [key, value],
    );
  }

  async removeValue(key: string): Promise<void> {
    await DatabaseService.execute('DELETE FROM key_value_store WHERE key = ?', [
      key,
    ]);
  }
}

export const SettingsRepository = new SettingsRepositoryClass();
