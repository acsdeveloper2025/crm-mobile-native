import { DatabaseService } from '../database/DatabaseService';
import type { LocalTask } from '../types/mobile';

class TaskDetailProjectionClass {
  async getTaskById(taskId: string): Promise<LocalTask | null> {
    const rows = await DatabaseService.query<{ taskJson: string }>(
      'SELECT task_json FROM task_detail_projection WHERE id = ? LIMIT 1',
      [taskId],
    );
    const raw = rows[0]?.taskJson;
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as LocalTask;
    } catch {
      return null;
    }
  }

  async getCoordinates(taskId: string): Promise<{ latitude: number | null; longitude: number | null } | null> {
    const rows = await DatabaseService.query<{ taskJson: string }>(
      'SELECT task_json FROM task_detail_projection WHERE id = ? LIMIT 1',
      [taskId],
    );
    const raw = rows[0]?.taskJson;
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as LocalTask;
      return {
        latitude: parsed.latitude ?? null,
        longitude: parsed.longitude ?? null,
      };
    } catch {
      return null;
    }
  }
}

export const TaskDetailProjection = new TaskDetailProjectionClass();
