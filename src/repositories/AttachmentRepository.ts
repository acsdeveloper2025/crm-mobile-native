import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import type { LocalAttachment } from '../types/mobile';

class AttachmentRepositoryClass {
  async create(input: {
    id: string;
    taskId: string;
    filename: string;
    mimeType: string;
    size: number;
    localPath: string;
    thumbnailPath?: string | null;
    uploadedAt: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    locationTimestamp?: string | null;
    componentType: 'photo' | 'selfie' | 'document';
    /**
     * 2026-04-28 (D6/D17 fix): SHA-256 hex of file bytes at capture.
     * Optional: callers can pass `null` if hash compute failed (we still
     * persist the row — better to have a row without hash than to lose
     * the photo). Backend integrity audit treats NULL as "client could
     * not hash" (unverifiable, but not a tamper signal).
     */
    clientSha256?: string | null;
  }): Promise<void> {
    await DatabaseService.execute(
      `INSERT INTO attachments
        (id, task_id, filename, original_name, mime_type, size,
         local_path, thumbnail_path, uploaded_at, latitude, longitude, accuracy,
         location_timestamp, component_type, client_sha256, sync_status, sync_attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
      [
        input.id,
        input.taskId,
        input.filename,
        input.filename,
        input.mimeType,
        input.size,
        input.localPath,
        input.thumbnailPath || null,
        input.uploadedAt,
        input.latitude ?? null,
        input.longitude ?? null,
        input.accuracy ?? null,
        input.locationTimestamp ?? null,
        input.componentType,
        input.clientSha256 ?? null,
      ],
    );
  }

  // H8/H9 (audit 2026-04-21): hard LIMIT on per-task queries. UI
  // rendering and validators only care about the current task's
  // attachments, and product limits cap photos-per-task well below
  // 500. The cap is a defense-in-depth against a corrupted / runaway
  // dataset OOM-ing the device.
  async listForTask(
    taskId: string,
    componentType?: 'photo' | 'selfie',
  ): Promise<LocalAttachment[]> {
    let query = 'SELECT * FROM attachments WHERE task_id = ?';
    const params: (string | number | null)[] = [taskId];
    if (componentType) {
      query += ' AND component_type = ?';
      params.push(componentType);
    }
    query += ' ORDER BY uploaded_at DESC LIMIT 500';
    return DatabaseService.query<LocalAttachment>(query, params);
  }

  async listForSubmission(taskId: string): Promise<LocalAttachment[]> {
    return DatabaseService.query<LocalAttachment>(
      `SELECT * FROM attachments
       WHERE task_id = ?
         AND component_type IN ('photo', 'selfie')
       ORDER BY uploaded_at ASC
       LIMIT 500`,
      [taskId],
    );
  }

  async listSyncedForTask(
    taskId: string,
  ): Promise<
    Array<{ id: string; localPath: string; thumbnailPath: string | null }>
  > {
    return DatabaseService.query<{
      id: string;
      localPath: string;
      thumbnailPath: string | null;
    }>(
      "SELECT id, local_path, thumbnail_path FROM attachments WHERE task_id = ? AND sync_status = 'SYNCED'",
      [taskId],
    );
  }

  async getById(
    id: string,
  ): Promise<{ localPath: string; thumbnailPath: string | null } | null> {
    const rows = await DatabaseService.query<{
      localPath: string;
      thumbnailPath: string | null;
    }>('SELECT local_path, thumbnail_path FROM attachments WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async deleteById(id: string): Promise<void> {
    await DatabaseService.execute('DELETE FROM attachments WHERE id = ?', [id]);
  }

  async deleteLocalFilesById(id: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) {
      return;
    }
    if (await RNFS.exists(row.localPath)) {
      await RNFS.unlink(row.localPath);
    }
    if (row.thumbnailPath && (await RNFS.exists(row.thumbnailPath))) {
      await RNFS.unlink(row.thumbnailPath);
    }
  }

  async deleteSyncedForTask(taskId: string): Promise<void> {
    const photos = await this.listSyncedForTask(taskId);
    for (const photo of photos) {
      if (await RNFS.exists(photo.localPath)) {
        await RNFS.unlink(photo.localPath);
      }
      if (photo.thumbnailPath && (await RNFS.exists(photo.thumbnailPath))) {
        await RNFS.unlink(photo.thumbnailPath);
      }
      await this.deleteById(photo.id);
    }
  }

  async updateUploadResult(
    id: string,
    backendAttachmentId?: string | null,
    remotePath?: string | null,
  ): Promise<void> {
    await DatabaseService.execute(
      `UPDATE attachments
       SET sync_status = 'SYNCED',
           backend_attachment_id = COALESCE(?, backend_attachment_id),
           remote_path = COALESCE(?, remote_path),
           last_sync_attempt_at = ?
       WHERE id = ?`,
      [
        backendAttachmentId || null,
        remotePath || null,
        new Date().toISOString(),
        id,
      ],
    );
  }

  async markMissingAsSynced(id: string): Promise<void> {
    await DatabaseService.execute(
      "UPDATE attachments SET sync_status = 'SYNCED' WHERE id = ?",
      [id],
    );
  }

  async getBackendAttachmentIds(taskId: string): Promise<string[]> {
    const rows = await DatabaseService.query<{
      backendAttachmentId: string | null;
    }>(
      `SELECT backend_attachment_id
       FROM attachments
       WHERE task_id = ?
         AND sync_status = 'SYNCED'
         AND backend_attachment_id IS NOT NULL`,
      [taskId],
    );
    return rows
      .map(row => row.backendAttachmentId)
      .filter((value): value is string => Boolean(value));
  }

  async getTotalStorageUsed(): Promise<number> {
    const rows = await DatabaseService.query<{ total: number }>(
      'SELECT COALESCE(SUM(size), 0) as total FROM attachments',
    );
    return rows[0]?.total ?? 0;
  }
  async countByTaskId(taskId: string): Promise<number> {
    const rows = await DatabaseService.query<{ total: number }>(
      'SELECT COUNT(*) as total FROM attachments WHERE task_id = ?',
      [taskId],
    );
    return rows[0]?.total ?? 0;
  }
}

export const AttachmentRepository = new AttachmentRepositoryClass();
