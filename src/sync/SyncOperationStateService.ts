import { DatabaseService } from '../database/DatabaseService';
import { KeyValueRepository } from '../repositories/KeyValueRepository';
import { Logger } from '../utils/logger';

const TAG = 'SyncOperationStateService';
const DONE_PREFIX = 'sync_operation_done_';
/** Delete operation state keys older than 48 hours to prevent unbounded growth */
const EXPIRY_HOURS = 48;

class SyncOperationStateServiceClass {
  private key(operationId: string): string {
    return `${DONE_PREFIX}${operationId}`;
  }

  async isProcessed(operationId: string): Promise<boolean> {
    const value = await KeyValueRepository.get(this.key(operationId));
    return Boolean(value);
  }

  async markProcessed(
    operationId: string,
    processedAt: string = new Date().toISOString(),
  ): Promise<void> {
    await KeyValueRepository.set(this.key(operationId), processedAt);
  }

  /**
   * Delete operation state keys older than EXPIRY_HOURS to prevent
   * unbounded key_value_store growth (1000 agents × 100 ops/day = 100k keys).
   */
  async clearExpired(): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - EXPIRY_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const result = await DatabaseService.execute(
        `DELETE FROM key_value_store WHERE key LIKE ? AND value < ?`,
        [`${DONE_PREFIX}%`, cutoff],
      );
      if (result.rowsAffected > 0) {
        Logger.info(
          TAG,
          `Cleaned up ${result.rowsAffected} expired operation state keys`,
        );
      }
    } catch (error) {
      Logger.warn(TAG, 'Failed to clear expired operation state keys', error);
    }
  }
}

export const SyncOperationStateService = new SyncOperationStateServiceClass();
