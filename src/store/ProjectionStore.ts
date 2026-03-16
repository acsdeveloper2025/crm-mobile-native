import { DashboardProjection, type DashboardProjectionStats } from '../projections/DashboardProjection';
import { ProjectionUpdater, type ProjectionChangeEvent } from '../projections/ProjectionUpdater';
import { TaskDetailProjection } from '../projections/TaskDetailProjection';
import { TaskListProjection } from '../projections/TaskListProjection';
import type { LocalTask } from '../types/mobile';

export type ProjectionEntityType = 'task' | 'all' | 'dashboard';

export interface ProjectionStoreState {
  dashboard: DashboardProjectionStats | null;
  taskLists: Record<string, string[]>;
  taskListQueries: Record<string, { statusFilter?: string; searchQuery?: string }>;
  taskDetailsLoaded: Record<string, true>;
  tasksById: Record<string, LocalTask>;
}

export interface ProjectionSelector<T> {
  key: string;
  select: (state: ProjectionStoreState) => T;
  ensure?: (store: ProjectionStoreClass, options?: { force?: boolean }) => Promise<void>;
  equalityFn?: (previous: T, next: T) => boolean;
}

type AnySubscription = {
  equalityFn: (previous: unknown, next: unknown) => boolean;
  listener: (value: unknown) => void;
  selector: ProjectionSelector<unknown>;
  value: unknown;
};

const DEFAULT_STATE: ProjectionStoreState = {
  dashboard: null,
  taskLists: {},
  taskListQueries: {},
  taskDetailsLoaded: {},
  tasksById: {},
};

class ProjectionStoreClass {
  private state: ProjectionStoreState = DEFAULT_STATE;
  private subscribers = new Map<number, AnySubscription>();
  private nextSubscriberId = 1;

  private pendingAll = false;
  private pendingDashboard = false;
  private pendingTaskIds = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private dashboardPromise: Promise<void> | null = null;
  private taskPromises = new Map<string, Promise<void>>();
  private taskListPromises = new Map<string, Promise<void>>();

  constructor() {
    ProjectionUpdater.subscribe((event: ProjectionChangeEvent) => {
      if (event.type === 'task') {
        this.notifyProjectionChange('task', event.taskId);
        return;
      }
      if (event.type === 'dashboard') {
        this.notifyProjectionChange('dashboard');
        return;
      }
      this.notifyProjectionChange('all');
    });
  }

  getState(): ProjectionStoreState {
    return this.state;
  }

  getTaskSnapshot(taskId: string): LocalTask | null {
    return this.state.tasksById[taskId] || null;
  }

  select<T>(selector: ProjectionSelector<T>): T {
    return selector.select(this.state);
  }

  subscribe<T>(
    selector: ProjectionSelector<T>,
    listener: (value: T) => void,
    equalityFn: (previous: T, next: T) => boolean,
  ): () => void {
    const id = this.nextSubscriberId++;
    this.subscribers.set(id, {
      equalityFn: equalityFn as (previous: unknown, next: unknown) => boolean,
      listener: listener as (value: unknown) => void,
      selector: selector as ProjectionSelector<unknown>,
      value: selector.select(this.state) as unknown,
    });

    return () => {
      this.subscribers.delete(id);
    };
  }

  async ensureSelector<T>(
    selector: ProjectionSelector<T>,
    options?: { force?: boolean },
  ): Promise<void> {
    if (!selector.ensure) {
      return;
    }
    await selector.ensure(this, options);
  }

  async ensureTask(taskId: string, options?: { force?: boolean }): Promise<void> {
    if (!taskId) {
      return;
    }
    if (!options?.force && this.state.taskDetailsLoaded[taskId]) {
      return;
    }
    const inFlight = this.taskPromises.get(taskId);
    if (inFlight && !options?.force) {
      await inFlight;
      return;
    }

    const load = (async () => {
      const task = await TaskDetailProjection.getTaskById(taskId);
      this.setState(current => {
        const nextTasksById = { ...current.tasksById };
        const nextDetailsLoaded = { ...current.taskDetailsLoaded };

        if (task) {
          nextTasksById[taskId] = task;
          nextDetailsLoaded[taskId] = true;
        } else {
          delete nextTasksById[taskId];
          delete nextDetailsLoaded[taskId];
        }

        return {
          ...current,
          taskDetailsLoaded: nextDetailsLoaded,
          tasksById: nextTasksById,
        };
      });
    })().finally(() => {
      this.taskPromises.delete(taskId);
    });

    this.taskPromises.set(taskId, load);
    await load;
  }

  async ensureTaskList(
    key: string,
    query: { statusFilter?: string; searchQuery?: string },
    options?: { force?: boolean },
  ): Promise<void> {
    if (!options?.force && this.state.taskLists[key]) {
      return;
    }
    const inFlight = this.taskListPromises.get(key);
    if (inFlight && !options?.force) {
      await inFlight;
      return;
    }

    const load = this.reloadTaskList(key, query).finally(() => {
      this.taskListPromises.delete(key);
    });
    this.taskListPromises.set(key, load);
    await load;
  }

  async ensureDashboard(options?: { force?: boolean }): Promise<void> {
    if (!options?.force && this.state.dashboard) {
      return;
    }
    if (this.dashboardPromise && !options?.force) {
      await this.dashboardPromise;
      return;
    }

    this.dashboardPromise = (async () => {
      const dashboard = await DashboardProjection.getStats();
      this.setState(current => ({
        ...current,
        dashboard,
      }));
    })().finally(() => {
      this.dashboardPromise = null;
    });

    await this.dashboardPromise;
  }

  notifyProjectionChange(entityType: ProjectionEntityType, entityId?: string): void {
    if (entityType === 'all') {
      this.pendingAll = true;
      this.pendingTaskIds.clear();
      this.pendingDashboard = true;
    } else if (entityType === 'dashboard') {
      this.pendingDashboard = true;
    } else if (entityId) {
      this.pendingTaskIds.add(entityId);
    }

    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushProjectionChanges()
        .catch(() => undefined)
        .finally(() => {
          if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
          }
        });
    }, 0);
  }

  private async flushProjectionChanges(): Promise<void> {
    const shouldReloadAll = this.pendingAll;
    const shouldReloadDashboard = this.pendingDashboard;
    const taskIds = Array.from(this.pendingTaskIds);

    this.pendingAll = false;
    this.pendingDashboard = false;
    this.pendingTaskIds.clear();

    if (shouldReloadAll) {
      const listEntries = Object.entries(this.state.taskListQueries);
      await Promise.all(listEntries.map(([key, query]) => this.reloadTaskList(key, query)));
      const detailIds = Object.keys(this.state.taskDetailsLoaded);
      await Promise.all(detailIds.map(taskId => this.ensureTask(taskId, { force: true })));
      if (shouldReloadDashboard || this.state.dashboard) {
        await this.ensureDashboard({ force: true });
      }
      return;
    }

    if (taskIds.length > 0) {
      const listEntries = Object.entries(this.state.taskListQueries);
      await Promise.all(taskIds.map(taskId => this.ensureTask(taskId, { force: true })));
      await Promise.all(listEntries.map(([key, query]) => this.reloadTaskList(key, query)));
    }

    if (shouldReloadDashboard && this.state.dashboard) {
      await this.ensureDashboard({ force: true });
    }
  }

  private async reloadTaskList(
    key: string,
    query: { statusFilter?: string; searchQuery?: string },
  ): Promise<void> {
    const tasks = await TaskListProjection.list(query.statusFilter, query.searchQuery);

    this.setState(current => {
      const nextTasksById = { ...current.tasksById };
      tasks.forEach(task => {
        const existing = current.tasksById[task.id];
        nextTasksById[task.id] = current.taskDetailsLoaded[task.id]
          ? { ...existing, ...task }
          : task;
      });

      return {
        ...current,
        taskListQueries: {
          ...current.taskListQueries,
          [key]: query,
        },
        taskLists: {
          ...current.taskLists,
          [key]: tasks.map(task => task.id),
        },
        tasksById: nextTasksById,
      };
    });
  }

  private setState(updater: (current: ProjectionStoreState) => ProjectionStoreState): void {
    const nextState = updater(this.state);
    if (nextState === this.state) {
      return;
    }
    this.state = nextState;
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((subscription, id) => {
      const nextValue = subscription.selector.select(this.state);
      if (subscription.equalityFn(subscription.value, nextValue)) {
        return;
      }

      this.subscribers.set(id, {
        ...subscription,
        value: nextValue,
      });
      (subscription.listener as (value: unknown) => void)(nextValue);
    });
  }
}

export const ProjectionStore = new ProjectionStoreClass();
