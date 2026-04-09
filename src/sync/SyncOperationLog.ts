import type { SyncQueueItem } from '../types/mobile';

export type SyncOperationType =
  | 'TASK_STARTED'
  | 'PHOTO_CAPTURED'
  | 'FORM_UPDATED'
  | 'FORM_SUBMITTED'
  | 'TASK_COMPLETED'
  | 'LEGACY_OPERATION';

export interface SyncOperation {
  operationId: string;
  type: SyncOperationType;
  entityType: SyncQueueItem['entityType'];
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  queueId: string;
  priority: number;
  taskKey: string;
}

const OPERATION_PRIORITY: Record<SyncOperationType, number> = {
  PHOTO_CAPTURED: 100,
  TASK_STARTED: 80,
  FORM_UPDATED: 70,
  FORM_SUBMITTED: 60,
  TASK_COMPLETED: 10,
  LEGACY_OPERATION: 50,
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const inferLegacyType = (item: SyncQueueItem, payload: Record<string, unknown>): SyncOperationType => {
  if (item.entityType === 'ATTACHMENT' || item.entityType === 'VISIT_PHOTO') {
    return 'PHOTO_CAPTURED';
  }
  if (item.entityType === 'FORM_SUBMISSION') {
    return 'FORM_SUBMITTED';
  }
  if (item.entityType === 'TASK_STATUS') {
    const status = String(payload.status || payload.action || '').toUpperCase();
    if (status === 'IN_PROGRESS') return 'TASK_STARTED';
    if (status === 'COMPLETED') return 'TASK_COMPLETED';
  }
  if (item.entityType === 'TASK') {
    const action = String(payload.action || '').toLowerCase();
    if (action === 'start') return 'TASK_STARTED';
    if (action === 'complete') return 'TASK_COMPLETED';
  }
  return 'LEGACY_OPERATION';
};

export const inferOperationType = (
  actionType: string,
  entityType: string,
  payload: Record<string, unknown>,
): SyncOperationType => {
  const tempItem = {
    actionType,
    entityType,
  } as SyncQueueItem;
  return inferLegacyType(tempItem, payload);
};

export const priorityForOperationType = (type: SyncOperationType): number =>
  OPERATION_PRIORITY[type] ?? OPERATION_PRIORITY.LEGACY_OPERATION;

export const toSyncOperation = (item: SyncQueueItem): SyncOperation => {
  const rawPayload = toRecord((() => {
    try {
      return JSON.parse(item.payloadJson || '{}');
    } catch {
      return {};
    }
  })());
  const operationMeta = toRecord(rawPayload._operation);
  const inferredType = inferLegacyType(item, rawPayload);
  const operationType = (asString(operationMeta.type) as SyncOperationType | null) || inferredType;
  const operationId = asString(operationMeta.operationId) || item.id;
  const createdAt = asString(operationMeta.created_at) || item.createdAt;
  const priority = Number(operationMeta.priority);
  const operationPriority = Number.isFinite(priority)
    ? priority
    : priorityForOperationType(operationType);
  const taskKey = asString(rawPayload.localTaskId)
    || asString(rawPayload.taskId)
    || asString(rawPayload.visitId)
    || (item.entityType === 'TASK' || item.entityType === 'TASK_STATUS' ? item.entityId : item.id);

  return {
    operationId,
    type: operationType,
    entityType: item.entityType,
    entityId: item.entityId,
    payload: rawPayload,
    createdAt,
    retryCount: item.attempts ?? 0,
    queueId: item.id,
    priority: operationPriority,
    taskKey,
  };
};
