// Background queue for re-stamping watermarked photos with address data
// When a photo is saved before the address is fetched, a job is queued here.
// The WatermarkReStamper component (mounted in App.tsx) processes these jobs.

import { Logger } from '../utils/logger';

const TAG = 'WatermarkReStampQueue';

export interface ReStampJob {
  attachmentId: string;
  rawPhotoPath: string;     // Original camera photo (no watermark)
  savedPhotoPath: string;   // Current watermarked photo (may lack address)
  taskId: string;
  componentType: 'photo' | 'selfie';
  location: { lat: number; lng: number; alt: number; spd: number; accuracy?: number; heading?: number; timestamp?: string };
  taskMeta: { caseId?: string; taskNumber?: string; customerName?: string; clientName?: string; productName?: string; verificationType?: string };
  dateStr: string;
  timeStr: string;
  queuedAt: number;
}

const pendingJobs: ReStampJob[] = [];
const listeners: Array<() => void> = [];

export const WatermarkReStampQueue = {
  enqueue(job: ReStampJob): void {
    pendingJobs.push(job);
    Logger.info(TAG, `Queued re-stamp for attachment ${job.attachmentId}`);
    listeners.forEach(fn => fn());
  },

  dequeue(): ReStampJob | null {
    return pendingJobs.shift() || null;
  },

  peek(): ReStampJob | null {
    return pendingJobs[0] || null;
  },

  get length(): number {
    return pendingJobs.length;
  },

  subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  },
};
