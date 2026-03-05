/**
 * AttachmentService - Pure Native Implementation
 * Manages task attachments, file downloads, and content retrieval using SQLite and RNFS.
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../utils/logger';
import { Attachment } from '../types/index';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { AuthService } from './AuthService';
import { config } from '../config';

const TAG = 'AttachmentService';
const CACHE_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

export interface RemoteTaskAttachment extends Attachment {
  source: 'REMOTE';
}

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
      const localRows = await DatabaseService.query<{
        id: string;
        filename: string;
        original_name: string;
        mime_type: string;
        size: number;
        local_path: string;
        remote_path?: string;
        backend_attachment_id?: string;
        uploaded_at: string;
        component_type: string;
        sync_status: string;
      }>(
        'SELECT * FROM attachments WHERE task_id = ? ORDER BY uploaded_at DESC',
        [taskId]
      );

      const localAttachments = localRows.map(row => ({
        id: row.id,
        name: row.original_name || row.filename,
        type: this.mapAttachmentType(row.mime_type),
        mimeType: this.mapAttachmentMimeType(row.mime_type),
        size: row.size,
        url: row.remote_path || '',
        localEncryptedPath: row.local_path,
        uploadedAt: row.uploaded_at,
        uploadedBy: row.component_type === 'photo' ? 'Field Agent' : 'System',
        description: `Source: ${row.component_type}`,
        metadata: {
          backendAttachmentId: row.backend_attachment_id || null,
          source: 'LOCAL',
        },
      }));

      const remoteAttachments = await this.getRemoteTaskAttachments(taskId);
      const localBackendIds = new Set(
        localAttachments
          .map(attachment => attachment.metadata?.backendAttachmentId)
          .filter((id): id is string => Boolean(id)),
      );

      const uniqueRemoteAttachments = remoteAttachments.filter(
        attachment => !localBackendIds.has(attachment.id),
      );

      return [...localAttachments, ...uniqueRemoteAttachments];
    } catch (error) {
      Logger.error(TAG, `Failed to get attachments for task ${taskId}`, error);
      return [];
    }
  }

  async getRemoteTaskAttachments(taskId: string): Promise<RemoteTaskAttachment[]> {
    try {
      const response = await ApiClient.get<{
        success: boolean;
        data?: Array<{
          id: string;
          filename?: string;
          originalName?: string;
          mimeType?: string;
          size?: number;
          url?: string;
          uploadedAt?: string;
        }>;
      }>(ENDPOINTS.ATTACHMENTS.LIST(taskId));

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data.map(attachment => {
        const mimeType = attachment.mimeType || 'application/pdf';
        return {
          id: attachment.id,
          name: attachment.originalName || attachment.filename || 'Attachment',
          type: this.mapAttachmentType(mimeType),
          mimeType: this.mapAttachmentMimeType(mimeType),
          size: Number(attachment.size || 0),
          url: this.normalizeRemoteAttachmentUrl(attachment.url, attachment.id),
          uploadedAt: attachment.uploadedAt || new Date().toISOString(),
          uploadedBy: 'CRM',
          description: 'Source: Backend/Web',
          taskId,
          source: 'REMOTE',
        };
      });
    } catch (error) {
      Logger.warn(TAG, `Failed to load remote attachments for task ${taskId}`, error);
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
    const safeName = attachment.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const filename = `${attachment.id}_${safeName}`;
    const destPath = `${CACHE_DIR}/${filename}`;

    const exists = await RNFS.exists(destPath);
    if (exists) return Platform.OS === 'android' ? `file://${destPath}` : destPath;

    const token = await AuthService.getAccessToken();
    const headers: Record<string, string> = {
      'X-App-Version': config.appVersion,
      'X-Platform': config.platform,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const candidateUrls = this.buildAttachmentContentUrls(attachment);
    Logger.info(
      TAG,
      `Downloading attachment ${attachment.id} using ${candidateUrls.length} URL candidate(s)`,
    );

    let lastFailureStatus = 0;
    for (const url of candidateUrls) {
      const result = await RNFS.downloadFile({
        fromUrl: url,
        toFile: destPath,
        headers,
      }).promise;

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return Platform.OS === 'android' ? `file://${destPath}` : destPath;
      }

      lastFailureStatus = result.statusCode;
      Logger.warn(TAG, `Attachment download attempt failed (${result.statusCode}) for ${url}`);
    }

    throw new Error(`Attachment download failed (${lastFailureStatus || 'unknown'})`);
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

  private mapAttachmentType(mimeType: string | undefined): 'image' | 'pdf' {
    const normalizedMime = (mimeType || '').toLowerCase();
    if (normalizedMime.startsWith('image/')) {
      return 'image';
    }
    return 'pdf';
  }

  private mapAttachmentMimeType(mimeType: string | undefined): Attachment['mimeType'] {
    const normalizedMime = (mimeType || '').toLowerCase();
    if (normalizedMime === 'image/png') {
      return 'image/png';
    }
    if (normalizedMime === 'image/jpg') {
      return 'image/jpg';
    }
    if (normalizedMime === 'image/jpeg') {
      return 'image/jpeg';
    }
    return 'application/pdf';
  }

  private normalizeRemoteAttachmentUrl(url: string | undefined, attachmentId: string): string {
    if (!url) {
      return `${config.apiBaseUrl}/attachments/${attachmentId}/content`;
    }

    if (url.startsWith('http')) {
      return url;
    }

    const apiMobile = config.apiBaseUrl.replace(/\/$/, '');
    const apiRoot = apiMobile.replace(/\/mobile$/, '');
    const origin = apiRoot.replace(/\/api$/, '');

    if (url.startsWith('/api/')) {
      return `${origin}${url}`;
    }

    if (url.startsWith('/mobile/')) {
      return `${apiRoot}${url}`;
    }

    if (url.startsWith('/attachments/')) {
      return `${apiMobile}${url}`;
    }

    if (url.startsWith('/')) {
      return `${apiMobile}${url}`;
    }

    return `${apiMobile}/${url}`;
  }

  private buildAttachmentContentUrls(attachment: Attachment): string[] {
    const urls: string[] = [];
    const normalizedPrimary = this.normalizeRemoteAttachmentUrl(
      attachment.url,
      attachment.id,
    );
    urls.push(normalizedPrimary);
    urls.push(`${config.apiBaseUrl}/attachments/${attachment.id}/content`);

    if (attachment.taskId) {
      urls.push(
        `${config.apiBaseUrl}/verification-tasks/${attachment.taskId}/attachments/${attachment.id}`,
      );
    }

    return Array.from(new Set(urls));
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
