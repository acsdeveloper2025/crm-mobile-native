import { ProjectionStore, type ProjectionSelector } from '../ProjectionStore';
import type { LocalTask } from '../../types/mobile';

const buildTaskListSelectorKey = (
  statusFilter?: string,
  searchQuery?: string,
): string => {
  const normalizedStatus = statusFilter || 'ALL';
  const normalizedSearch = (searchQuery || '').trim().toLowerCase();
  return `task-list:${normalizedStatus}:${normalizedSearch}`;
};

export const selectTaskById = (taskId: string): ProjectionSelector<LocalTask | null> => ({
  key: `task:${taskId}`,
  select: state => state.tasksById[taskId] || null,
  ensure: (store, options) => store.ensureTask(taskId, options),
});

export const selectTasksByStatus = (
  statusFilter?: string,
  searchQuery?: string,
): ProjectionSelector<string[]> => {
  const key = buildTaskListSelectorKey(statusFilter, searchQuery);
  return {
    key,
    select: state => state.taskLists[key] || [],
    ensure: (store, options) => store.ensureTaskList(key, { statusFilter, searchQuery }, options),
  };
};

export const getTaskSnapshot = (taskId: string): LocalTask | null =>
  ProjectionStore.getTaskSnapshot(taskId);
