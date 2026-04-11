import { SyncQueue, SYNC_PRIORITY } from './SyncQueue';

class SyncGatewayClass {
  async enqueueTaskUpdate(
    backendTaskId: string,
    localTaskId: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.NORMAL,
  ): Promise<void> {
    await SyncQueue.enqueue(
      'UPDATE',
      'TASK',
      backendTaskId,
      { localTaskId, ...payload },
      priority,
    );
  }

  async enqueueTaskStatus(
    backendTaskId: string,
    localTaskId: string,
    status: string,
    extraPayload: Record<string, unknown> = {},
    priority: number = SYNC_PRIORITY.CRITICAL,
  ): Promise<void> {
    await SyncQueue.enqueue(
      'UPDATE',
      'TASK_STATUS',
      backendTaskId,
      {
        localTaskId,
        taskId: backendTaskId,
        status,
        action: String(status).toUpperCase(),
        timestamp: new Date().toISOString(),
        ...extraPayload,
      },
      priority,
    );
  }

  async enqueueLocation(
    id: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.CRITICAL,
  ): Promise<void> {
    await SyncQueue.enqueue('CREATE', 'LOCATION', id, payload, priority);
  }

  async enqueueAttachment(
    id: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.HIGH,
  ): Promise<void> {
    await SyncQueue.enqueue('CREATE', 'ATTACHMENT', id, payload, priority);
  }

  async enqueueFormSubmission(
    id: string,
    payload: Record<string, unknown>,
    priority: number = SYNC_PRIORITY.HIGH,
  ): Promise<void> {
    await SyncQueue.enqueue('CREATE', 'FORM_SUBMISSION', id, payload, priority);
  }
}

export const SyncGateway = new SyncGatewayClass();
