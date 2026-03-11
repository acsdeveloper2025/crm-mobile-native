import { DatabaseService } from '../database/DatabaseService';
import type { GeoLocation } from '../types/api';
import type { LocalLocation } from '../types/mobile';

class LocationRepositoryClass {
  async create(input: {
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
    source: string;
    taskId?: string;
    activityType?: string;
  }): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO locations (id, latitude, longitude, accuracy, timestamp, source, task_id, activity_type, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        input.id,
        input.latitude,
        input.longitude,
        input.accuracy,
        input.timestamp,
        input.source,
        input.taskId || null,
        input.activityType || null,
      ],
    );
  }

  async createTracked(input: {
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
    source: string;
  }): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO locations (id, latitude, longitude, accuracy, timestamp, source, activity_type, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, 'TRAVEL', 'PENDING')`,
      [input.id, input.latitude, input.longitude, input.accuracy, input.timestamp, input.source],
    );
  }

  async listForTask(taskId: string): Promise<LocalLocation[]> {
    return DatabaseService.query<LocalLocation>(
      'SELECT * FROM locations WHERE task_id = ? ORDER BY timestamp DESC',
      [taskId],
    );
  }

  async getLatestForTask(taskId: string): Promise<GeoLocation | null> {
    const rows = await DatabaseService.query<GeoLocation>(
      `SELECT latitude, longitude, accuracy, timestamp
       FROM locations
       WHERE task_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [taskId],
    );
    return rows[0] ?? null;
  }

  async markSynced(id: string): Promise<void> {
    await DatabaseService.execute(
      "UPDATE locations SET sync_status = 'SYNCED', synced_at = ? WHERE id = ?",
      [new Date().toISOString(), id],
    );
  }
}

export const LocationRepository = new LocationRepositoryClass();
