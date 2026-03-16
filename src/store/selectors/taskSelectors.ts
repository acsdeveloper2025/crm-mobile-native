import type { DashboardProjectionStats } from '../../projections/DashboardProjection';
import { ProjectionStore, type ProjectionSelector } from '../ProjectionStore';
import type { LocalTask } from '../../types/mobile';

const DASHBOARD_DEFAULT: DashboardProjectionStats = {
  activeCount: 0,
  assignedCount: 0,
  completedCount: 0,
  inProgressCount: 0,
  lastSyncAt: null,
  savedCount: 0,
  updatedAt: null,
};

export const buildTaskListSelectorKey = (
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

export const selectPendingTasks = (searchQuery?: string): ProjectionSelector<string[]> =>
  selectTasksByStatus('ASSIGNED', searchQuery);

export const selectDashboardStats = (): ProjectionSelector<DashboardProjectionStats> => ({
  key: 'dashboard',
  select: state => state.dashboard || DASHBOARD_DEFAULT,
  ensure: (store, options) => store.ensureDashboard(options),
});

export const getTaskSnapshot = (taskId: string): LocalTask | null =>
  ProjectionStore.getTaskSnapshot(taskId);
