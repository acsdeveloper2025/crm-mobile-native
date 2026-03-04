/**
 * AttachmentService - Pure Native Implementation
 * Manages task attachments, file downloads, and content retrieval using SQLite and RNFS.
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';
import { Attachment } from '../types/index';

const TAG = 'AttachmentService';
const CACHE_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

class AttachmentServiceClass {
  private initialized = false;
  private isOfflineMode = false;

  /**
   * Initialize the service and ensure cache directory exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const exists = await RNFS.exists(CACHE_DIR);
      if (!exists) {
        await RNFS.mkdir(CACHE_DIR);
      }
      this.initialized = true;
    } catch (error) {
      Logger.error(TAG, 'Failed to initialize AttachmentService', error);
    }
  }

  /**
   * Set offline mode status
   */
  setOfflineMode(offline: boolean): void {
    this.isOfflineMode = offline;
    Logger.info(TAG, `Offline mode: ${offline}`);
  }

  /**
   * Get all attachments for a specific task from local database
   */
  async getTaskAttachments(taskId: string): Promise<Attachment[]> {
    try {
      await this.initialize();

      // Query local attachments table
      const rows = await DatabaseService.query<{
        id: string;
        filename: string;
        original_name: string;
        mime_type: string;
        size: number;
        local_path: string;
        uploaded_at: string;
        component_type: string;
        sync_status: string;
      }>(
        'SELECT * FROM attachments WHERE task_id = ? ORDER BY uploaded_at DESC',
        [taskId]
      );

      return rows.map(row => ({
        id: row.id,
        name: row.original_name || row.filename,
        type: (row.mime_type?.startsWith('image/') ? 'image' : 'pdf') as 'image' | 'pdf',
        mimeType: row.mime_type as any,
        size: row.size,
        url: '', // Local attachments use local_path, remote use API URL
        localEncryptedPath: row.local_path,
        uploadedAt: row.uploaded_at,
        uploadedBy: row.component_type === 'photo' ? 'Field Agent' : 'System',
        description: `Source: ${row.component_type}`
      }));
    } catch (error) {
      Logger.error(TAG, `Failed to get attachments for task ${taskId}`, error);
      return [];
    }
  }

  /**
   * Get content URI for an attachment
   * Returns a local file URI (file://...)
   */
  async getAttachmentContent(attachment: Attachment): Promise<string> {
    try {
      await this.initialize();

      // Case 1: Already has a local encrypted path
      if (attachment.localEncryptedPath) {
        const exists = await RNFS.exists(attachment.localEncryptedPath);
        if (exists) {
          // Note: If encrypted, EncryptedImage component handles decryption
          return Platform.OS === 'android' 
            ? `file://${attachment.localEncryptedPath}` 
            : attachment.localEncryptedPath;
        }
      }

      // Case 2: Source from remote URL (not yet implemented in depth, but following pattern)
      if (attachment.url && attachment.url.startsWith('http')) {
        return this.downloadAndCache(attachment);
      }

      throw new Error('Attachment content not found');
    } catch (error) {
      Logger.error(TAG, 'Failed to get attachment content', error);
      throw error;
    }
  }

  /**
   * Mock download and cache for remote attachments
   */
  private async downloadAndCache(attachment: Attachment): Promise<string> {
    const filename = `${attachment.id}_${attachment.name}`;
    const destPath = `${CACHE_DIR}/${filename}`;

    const exists = await RNFS.exists(destPath);
    if (exists) return destPath;

    // In a real implementation, we would use RNFS.downloadFile with Auth headers
    Logger.info(TAG, `Downloading attachment ${attachment.id} to cache`);
    
    // For now, if we don't have it, we return the URL if it's HTTPS
    return attachment.url || '';
  }

  /**
   * Utility: Format file size to human readable string
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Utility: Is it a PDF?
   */
  isPdfAttachment(attachment: Attachment): boolean {
    return attachment.mimeType === 'application/pdf' || attachment.type === 'pdf';
  }

  /**
   * Utility: Is it an image?
   */
  isImageAttachment(attachment: Attachment): boolean {
    return attachment.mimeType.startsWith('image/') || attachment.type === 'image';
  }

  /**
   * Utility: Get visual icon based on file type
   */
  getFileTypeIcon(attachment: Attachment): string {
    if (this.isPdfAttachment(attachment)) return '📄';
    if (this.isImageAttachment(attachment)) return '🖼️';
    return '📎';
  }

  /**
   * Check if available offline (in local database or cache)
   */
  async isAttachmentAvailableOffline(attachmentId: string): Promise<boolean> {
    const rows = await DatabaseService.query(
      'SELECT id FROM attachments WHERE id = ? AND local_path IS NOT NULL',
      [attachmentId]
    );
    return rows.length > 0;
  }
}

export const attachmentService = new AttachmentServiceClass();
export default attachmentService;
