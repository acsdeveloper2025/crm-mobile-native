export type SyncUploadOutcome = 'SUCCESS' | 'DEFER' | 'FAILURE';

export interface SyncUploadResult {
  outcome: SyncUploadOutcome;
  error?: string;
}

export const idempotencyHeaders = (operationId: string) => ({
  headers: {
    'Idempotency-Key': operationId,
  },
});
