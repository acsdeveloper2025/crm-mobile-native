import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import type { LocalAttachment } from '../types/mobile';

// ⚠️ ATTACHMENT != PHOTO. Despite the table it reads, this repository holds ZERO
// attachments: it is the store for the field agent's own camera CAPTURES
// (component_type 'photo' | 'selfie') — the EVIDENCE the 5-photo + 1-selfie rule
// counts. An ATTACHMENT is an admin-uploaded reference doc, fetched over HTTP on
// demand by AttachmentService, never stored here, and read-only on the device —
// so it can never gate the agent's work.
//
// 2026-07-17: renamed from `AttachmentRepository`. The name was the trap: it
// invited a reader to reason about admin docs while every method handles the
// agent's photos. It leaked the truth itself — `deleteSyncedForTask` named its
// own rows `photos`, and CameraService wrapped `listForTask` as
// `getPhotosForTask`. The physical table is still called `attachments`; renaming
// it needs a migration over live SQLCipher evidence, so the honest name is
// recorded in src/database/schema.ts instead.
class CaptureRepositoryClass {
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
    componentType: 'photo' | 'selfie';
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

  // 2026-07-17: `deleteSyncedForTask` and its only caller-of-one,
  // `listSyncedForTask`, were deleted here — both had ZERO callers, and the
  // pair was a DRIFTED twin of the live rule (FormUploader.ts:110). It filtered
  // on sync_status='SYNCED' alone, dropping the `backend_attachment_id IS NOT
  // NULL` guard that is the whole reason a local file is dispensable, and it
  // HARD-DELETED the row where the live path only clears local_path. Wiring it
  // up would have unlinked and deleted evidence the server never confirmed.
  // Same shape as the reaper fixed in StorageService.cleanupSyncedData, and the
  // same trap `listOldTerminalTaskIds` set: dead, but it reads as the rule.

  // 2026-07-17: `updateUploadResult`, `markMissingAsSynced` and
  // `getBackendAttachmentIds` were deleted here — all three had ZERO callers
  // and were stale twins of the SQL the uploaders run inline
  // (AttachmentUploader.ts:210-223, FormUploader.ts:95-99). Dead-but-armed:
  // they READ as the upload-completion rule, so an edit here would look
  // correct and change nothing — the same trap `listOldTerminalTaskIds` set.
  // If this SQL ever needs to move behind the repository, move the LIVE
  // uploader statements; do not resurrect a parallel copy.

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

export const CaptureRepository = new CaptureRepositoryClass();
