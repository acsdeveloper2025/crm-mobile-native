/**
 * AttachmentService - Pure Native Implementation
 * Manages task attachments, file downloads, and content retrieval using SQLite and RNFS.
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { Logger } from '../utils/logger';
import { Attachment } from '../types/index';
import { ApiClient } from '../api/apiClient';
import { ENDPOINTS } from '../api/endpoints';
import { config } from '../config';
import { SessionStore } from './SessionStore';

const TAG = 'AttachmentService';
const CACHE_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

export interface RemoteTaskAttachment extends Attachment {
  source: 'REMOTE';
}

/** Maximum age for cached attachment files (30 days in ms) */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

class AttachmentServiceClass {
  private initialized = false;
  private isOfflineMode = false;

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

  setOfflineMode(offline: boolean): void {
    this.isOfflineMode = offline;
    Logger.info(TAG, `Offline mode: ${offline}`);
  }

  async getRemoteTaskAttachments(
    taskId: string,
  ): Promise<RemoteTaskAttachment[]> {
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
      Logger.warn(
        TAG,
        `Failed to load remote attachments for task ${taskId}`,
        error,
      );
      return [];
    }
  }

  async getAttachmentContent(attachment: Attachment): Promise<string> {
    await this.initialize();

    if (attachment.localEncryptedPath) {
      const exists = await RNFS.exists(attachment.localEncryptedPath);
      if (exists) {
        return Platform.OS === 'android'
          ? `file://${attachment.localEncryptedPath}`
          : attachment.localEncryptedPath;
      }
    }

    if (attachment.url && attachment.url.startsWith('http')) {
      return this.downloadAndCache(attachment);
    }

    throw new Error('Attachment content not found');
  }

  private async downloadAndCache(attachment: Attachment): Promise<string> {
    const safeName = attachment.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const filename = `${attachment.id}_${safeName}`;
    const destPath = `${CACHE_DIR}/${filename}`;
    const exists = await RNFS.exists(destPath);
    if (exists)
      return Platform.OS === 'android' ? `file://${destPath}` : destPath;

    const token = await SessionStore.getAccessToken();
    const headers: Record<string, string> = {
      'X-App-Version': config.appVersion,
      'X-Platform': config.platform,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const candidateUrls = this.buildAttachmentContentUrls(attachment);
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
      Logger.warn(
        TAG,
        `Attachment download attempt failed (${result.statusCode}) for ${url}`,
      );
    }

    throw new Error(
      `Attachment download failed (${lastFailureStatus || 'unknown'})`,
    );
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private mapAttachmentType(mimeType: string | undefined): 'image' | 'pdf' {
    return (mimeType || '').toLowerCase().startsWith('image/')
      ? 'image'
      : 'pdf';
  }

  private mapAttachmentMimeType(
    mimeType: string | undefined,
  ): Attachment['mimeType'] {
    const normalizedMime = (mimeType || '').toLowerCase();
    if (normalizedMime === 'image/png') return 'image/png';
    if (normalizedMime === 'image/jpg') return 'image/jpg';
    if (normalizedMime === 'image/jpeg') return 'image/jpeg';
    return 'application/pdf';
  }

  private normalizeRemoteAttachmentUrl(
    url: string | undefined,
    attachmentId: string,
  ): string {
    if (!url) return `${config.apiBaseUrl}/attachments/${attachmentId}/content`;
    if (url.startsWith('http')) return url;

    const apiMobile = config.apiBaseUrl.replace(/\/$/, '');
    const apiRoot = apiMobile.replace(/\/mobile$/, '');
    const origin = apiRoot.replace(/\/api$/, '');

    if (url.startsWith('/api/')) return `${origin}${url}`;
    if (url.startsWith('/mobile/')) return `${apiRoot}${url}`;
    if (url.startsWith('/attachments/')) return `${apiMobile}${url}`;
    if (url.startsWith('/')) return `${apiMobile}${url}`;
    return `${apiMobile}/${url}`;
  }

  /**
   * Remove cached attachment files older than CACHE_MAX_AGE_MS.
   * Call periodically (e.g., during sync cleanup) to prevent unbounded storage growth.
   */
  async cleanupExpiredCache(): Promise<number> {
    try {
      await this.initialize();
      const files = await RNFS.readDir(CACHE_DIR);
      const cutoff = Date.now() - CACHE_MAX_AGE_MS;
      let deleted = 0;

      for (const file of files) {
        if (file.isFile()) {
          const mtime = file.mtime ? new Date(file.mtime).getTime() : 0;
          if (mtime > 0 && mtime < cutoff) {
            await RNFS.unlink(file.path);
            deleted++;
          }
        }
      }

      if (deleted > 0) {
        Logger.info(TAG, `Cleaned up ${deleted} expired cached attachment(s)`);
      }
      return deleted;
    } catch (error) {
      Logger.warn(TAG, 'Failed to cleanup expired cache', error);
      return 0;
    }
  }

  /**
   * Strip EXIF metadata from image before upload to protect user privacy.
   * Vision Camera captures raw JPEG with GPS/device data in EXIF headers.
   * NOTE: For full EXIF stripping, use a native library like react-native-image-manipulator
   * on the upload path. This method provides a placeholder for the integration.
   */
  async stripExifMetadata(imagePath: string): Promise<string> {
    // TODO: Integrate react-native-image-manipulator or similar to strip EXIF
    // For now, the watermark processing already re-encodes the image which
    // removes most EXIF data, but explicit stripping is recommended.
    Logger.debug(TAG, `EXIF stripping placeholder for: ${imagePath}`);
    return imagePath;
  }

  private buildAttachmentContentUrls(attachment: Attachment): string[] {
    const urls = [
      this.normalizeRemoteAttachmentUrl(attachment.url, attachment.id),
      `${config.apiBaseUrl}/attachments/${attachment.id}/content`,
    ];
    if (attachment.taskId) {
      urls.push(
        `${config.apiBaseUrl}/verification-tasks/${attachment.taskId}/attachments/${attachment.id}`,
      );
    }
    return Array.from(new Set(urls));
  }
}

export const attachmentService = new AttachmentServiceClass();
export default attachmentService;
