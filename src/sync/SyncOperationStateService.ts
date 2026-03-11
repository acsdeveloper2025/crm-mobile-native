import { KeyValueRepository } from '../repositories/KeyValueRepository';

const DONE_PREFIX = 'sync_operation_done_';
class SyncOperationStateServiceClass {
  private key(operationId: string): string {
    return `${DONE_PREFIX}${operationId}`;
  }

  async isProcessed(operationId: string): Promise<boolean> {
    const value = await KeyValueRepository.get(this.key(operationId));
    return Boolean(value);
  }

  async markProcessed(operationId: string, processedAt: string = new Date().toISOString()): Promise<void> {
    await KeyValueRepository.set(this.key(operationId), processedAt);
  }

  async clearExpired(): Promise<void> {
    // No-op for now because key_value_store doesn't expose indexed prefix scans
    // in repository APIs. Safe to keep because keys are only written once per operation.
  }
}

export const SyncOperationStateService = new SyncOperationStateServiceClass();
