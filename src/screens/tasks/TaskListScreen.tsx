import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useDeferredValue,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {
  useRoute,
  useFocusEffect,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  RootStackParamList,
  TabParamList,
} from '../../navigation/RootNavigator';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTasks } from '../../hooks/useTasks';
import { UppercaseTextInput } from '../../components/ui/UppercaseTextInput';
import { Logger } from '../../utils/logger';
import { TaskCard } from '../../components/tasks/TaskCard';
import { TaskCardSkeleton } from '../../components/ui/Skeleton';
import { LocalTask } from '../../types/mobile';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTaskManager } from '../../context/TaskContext';
import {
  TaskRepository,
  type TaskListCounts,
} from '../../repositories/TaskRepository';
import { TaskInfoModal } from '../../components/tasks/TaskInfoModal';
import { TaskRevokeModal } from '../../components/tasks/TaskRevokeModal';
import { RevokeReason } from '../../types/api';
import {
  selectTaskById,
  getTaskSnapshot,
} from '../../store/selectors/taskSelectors';
import { useSelector } from '../../store/useSelector';

// Updated tab bar filters for tasks to include Saved and Revoked
const FILTER_TABS = [
  { id: 'ALL', label: 'All', value: undefined },
  { id: 'ASSIGNED', label: 'Assigned', value: 'ASSIGNED' },
  { id: 'IN_PROGRESS', label: 'In Progress', value: 'IN_PROGRESS' },
  { id: 'COMPLETED', label: 'Completed', value: 'COMPLETED' },
  { id: 'SAVED', label: 'Saved', value: 'SAVED' },
] as const;

type FilterTabDef = (typeof FILTER_TABS)[number];

// M8 (audit 2026-04-21): memoized filter-tab pill so the 5-tab row
// doesn't re-render on every parent state tick. The parent passes a
// stable `onSelect` and the tab renders only when its own `isActive`,
// `count`, or theme colors change.
const FilterTabPill = React.memo(
  ({
    tab,
    isActive,
    count,
    theme,
    onSelect,
  }: {
    tab: FilterTabDef;
    isActive: boolean;
    count: number | undefined;
    theme: ReturnType<typeof useTheme>['theme'];
    onSelect: (tab: FilterTabDef) => void;
  }) => {
    const handlePress = useCallback(() => onSelect(tab), [onSelect, tab]);
    return (
      <TouchableOpacity
        style={[
          styles.filterTab,
          { backgroundColor: theme.colors.surfaceAlt },
          isActive && [
            styles.activeFilterTab,
            { backgroundColor: theme.colors.primary },
          ],
        ]}
        onPress={handlePress}
      >
        <Text
          style={[
            styles.filterText,
            { color: theme.colors.textSecondary },
            isActive && [
              styles.activeFilterText,
              { color: theme.colors.surface },
            ],
          ]}
        >
          {tab.label}
          {count !== undefined ? ` (${count})` : ''}
        </Text>
      </TouchableOpacity>
    );
  },
);
FilterTabPill.displayName = 'FilterTabPill';

const TaskListRow = React.memo(
  ({
    taskId,
    canMoveDown,
    canMoveUp,
    canReorder,
    handleAttachmentsPress,
    handleInfoPress,
    handleMoveTask,
    handleRevokePress,
    handleTaskPress,
    refetch,
    reorderMode,
  }: {
    taskId: string;
    canMoveDown: boolean;
    canMoveUp: boolean;
    canReorder: boolean;
    handleAttachmentsPress: (task: LocalTask) => void;
    handleInfoPress: (task: LocalTask) => void;
    handleMoveTask: (taskId: string, direction: 'up' | 'down') => Promise<void>;
    handleRevokePress: (task: LocalTask) => void;
    handleTaskPress: (task: LocalTask) => void;
    refetch: () => Promise<void>;
    reorderMode: boolean;
  }) => {
    const task = useSelector(selectTaskById(taskId));

    if (!task) {
      return null;
    }

    return (
      <TaskCard
        task={task}
        onPress={handleTaskPress}
        onStatusChange={refetch}
        onAttachmentsPress={handleAttachmentsPress}
        onInfoPress={handleInfoPress}
        onRevokePress={handleRevokePress}
        isReorderEnabled={reorderMode && canReorder}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveTask={handleMoveTask}
      />
    );
  },
);

// H21 completion (2026-04-21): TaskListScreen is a shared component
// used by the 4 tab-screen wrappers (Saved/Assigned/InProgress/
// Completed). Each wrapper types its own navigation as a
// CompositeNavigationProp merging the tab + root stack. This alias
// captures the shape they all spread in, with the tab slot left
// generic (keyof TabParamList) so Saved/Assigned/… all fit.
type TaskListNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, keyof TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface TaskListScreenProps {
  navigation: TaskListNavigation;
  defaultFilter?: string;
  defaultLockedFilter?: boolean;
  defaultSearchPlaceholder?: string;
}

export const TaskListScreen = ({
  navigation,
  defaultFilter,
  defaultLockedFilter,
  defaultSearchPlaceholder,
}: TaskListScreenProps) => {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const initialFilter = route.params?.filter ?? defaultFilter;
  const initialTab =
    FILTER_TABS.find(tab => tab.value === initialFilter) || FILTER_TABS[0];
  const lockedFilter = Boolean(
    route.params?.lockedFilter ?? defaultLockedFilter,
  );
  const [sortMode, setSortMode] = useState<'order' | 'priority'>('order');
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedInfoTask, setSelectedInfoTask] = useState<LocalTask | null>(
    null,
  );
  const [selectedRevokeTask, setSelectedRevokeTask] =
    useState<LocalTask | null>(null);
  const [isRevokingTask, setIsRevokingTask] = useState(false);
  const [counts, setCounts] = useState<TaskListCounts>({
    ALL: 0,
    ASSIGNED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    SAVED: 0,
  });
  const insets = useSafeAreaInsets();
  const { setTaskPriority, revokeTask } = useTaskManager();

  const statusFilter = lockedFilter ? initialFilter : activeTab.value;
  const { taskIds, isLoading, error, refetch } = useTasks(
    statusFilter,
    deferredSearchQuery,
  );
  const canReorder =
    lockedFilter &&
    (initialFilter === 'ASSIGNED' || initialFilter === 'IN_PROGRESS');

  useEffect(() => {
    if (route.params?.filter) {
      const tab = FILTER_TABS.find(t => t.value === route.params?.filter);
      if (tab) setActiveTab(tab);
    }
  }, [route.params?.filter]);

  // M8 (audit 2026-04-21): stable reference so the memoized
  // FilterTabPill only re-renders when its own tab's isActive / count
  // changes, not on every parent state tick.
  const handleFilterTabSelect = useCallback(
    (tab: FilterTabDef) => setActiveTab(tab),
    [],
  );

  const metadata = useMemo(() => {
    if (!lockedFilter) {
      return {
        title: 'All Cases',
        emptyMessage: 'No tasks found for this status.',
        searchPlaceholder: 'Search cases...',
      };
    }

    if (initialFilter === 'ASSIGNED') {
      return {
        title: 'Assigned Tasks',
        emptyMessage: 'No assigned cases at the moment.',
        searchPlaceholder:
          defaultSearchPlaceholder || 'Search assigned tasks...',
      };
    }
    if (initialFilter === 'IN_PROGRESS') {
      return {
        title: 'In Progress Tasks',
        emptyMessage: 'No cases are currently in progress.',
        searchPlaceholder:
          defaultSearchPlaceholder || 'Search in progress tasks...',
      };
    }
    if (initialFilter === 'SAVED') {
      return {
        title: 'Saved for Offline',
        emptyMessage:
          'Use the Save button on a case in the In Progress tab to save it for offline use.',
        searchPlaceholder: defaultSearchPlaceholder || 'Search saved tasks...',
      };
    }
    if (initialFilter === 'COMPLETED') {
      return {
        title: 'Completed Tasks',
        emptyMessage: 'You have not completed any cases yet.',
        searchPlaceholder:
          defaultSearchPlaceholder || 'Search completed tasks...',
      };
    }
    return {
      title: 'All Cases',
      emptyMessage: 'No tasks found for this status.',
      searchPlaceholder: 'Search cases...',
    };
  }, [defaultSearchPlaceholder, initialFilter, lockedFilter]);

  const renderedTasks = useMemo(() => {
    if (
      initialFilter !== 'IN_PROGRESS' ||
      !lockedFilter ||
      sortMode === 'order'
    ) {
      return taskIds;
    }

    return [...taskIds].sort((leftId, rightId) => {
      const left = getTaskSnapshot(leftId);
      const right = getTaskSnapshot(rightId);
      const leftPriority = left?.priority ? Number(left.priority) : 0;
      const rightPriority = right?.priority ? Number(right.priority) : 0;
      if (leftPriority > 0 && rightPriority > 0) {
        return leftPriority - rightPriority;
      }
      if (leftPriority > 0 && rightPriority <= 0) {
        return -1;
      }
      if (leftPriority <= 0 && rightPriority > 0) {
        return 1;
      }
      return 0;
    });
  }, [initialFilter, lockedFilter, sortMode, taskIds]);

  useEffect(() => {
    if (!reorderMode) {
      return;
    }

    const sortedByPriority = [...renderedTasks].sort((leftId, rightId) => {
      const left = getTaskSnapshot(leftId);
      const right = getTaskSnapshot(rightId);
      const leftPriority = left?.priority ? Number(left.priority) : 0;
      const rightPriority = right?.priority ? Number(right.priority) : 0;

      if (leftPriority > 0 && rightPriority > 0) {
        return leftPriority - rightPriority;
      }
      if (leftPriority > 0) {
        return -1;
      }
      if (rightPriority > 0) {
        return 1;
      }
      return 0;
    });

    setReorderIds(sortedByPriority);
  }, [reorderMode, renderedTasks]);

  const visibleTasks = useMemo(() => {
    if (!reorderMode) {
      return renderedTasks;
    }

    const renderedTaskIds = new Set(renderedTasks);
    const ordered = reorderIds.filter((id: string) => renderedTaskIds.has(id));
    const remaining = renderedTasks.filter(
      (id: string) => !reorderIds.includes(id),
    );
    return [...ordered, ...remaining];
  }, [reorderIds, renderedTasks, reorderMode]);

  useFocusEffect(
    useCallback(() => {
      const fetchCounts = async () => {
        try {
          setCounts(await TaskRepository.getTaskListCounts());
        } catch (err) {
          Logger.error('TaskListScreen', 'Error fetching tab counts', err);
        }
      };

      fetchCounts();
    }, []),
  );

  const handleTaskPress = useCallback(
    (task: LocalTask) => {
      if (task.status === 'IN_PROGRESS' || task.status === 'REVISIT') {
        navigation.navigate('VerificationForm', { taskId: task.id });
        return;
      }
      if (task.status === 'COMPLETED') {
        navigation.navigate('TaskDetail', { taskId: task.id });
        return;
      }
      if (task.status === 'ASSIGNED' || task.status === 'REVOKED') {
        return;
      }
      if (task.isSaved === 1) {
        navigation.navigate('VerificationForm', { taskId: task.id });
        return;
      }
      navigation.navigate('TaskDetail', { taskId: task.id });
    },
    [navigation],
  );

  const handleAttachmentsPress = useCallback(
    (task: LocalTask) => {
      navigation.navigate('TaskAttachments', {
        taskId: task.id,
        taskNumber: task.verificationTaskNumber || `#${task.caseId}`,
      });
    },
    [navigation],
  );

  const handleInfoPress = useCallback((task: LocalTask) => {
    setSelectedInfoTask(task);
  }, []);

  const handleRevokePress = useCallback((task: LocalTask) => {
    setSelectedRevokeTask(task);
  }, []);

  const handleRevokeConfirm = useCallback(
    async (reason: RevokeReason) => {
      if (!selectedRevokeTask) {
        return;
      }
      try {
        setIsRevokingTask(true);
        await revokeTask(selectedRevokeTask.id, reason);
        setSelectedRevokeTask(null);
        await refetch();
      } catch (revokeError: unknown) {
        Alert.alert(
          'Error',
          'Failed to revoke task: ' +
            (revokeError instanceof Error
              ? revokeError.message
              : String(revokeError) || 'Unknown error'),
        );
      } finally {
        setIsRevokingTask(false);
      }
    },
    [refetch, revokeTask, selectedRevokeTask],
  );

  const handleMoveTask = useCallback(
    async (taskId: string, direction: 'up' | 'down') => {
      if (!reorderMode || isSavingOrder) {
        return;
      }

      const currentIndex = reorderIds.indexOf(taskId);
      if (currentIndex < 0) {
        return;
      }
      const targetIndex =
        direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= reorderIds.length) {
        return;
      }

      const nextIds = [...reorderIds];
      [nextIds[currentIndex], nextIds[targetIndex]] = [
        nextIds[targetIndex],
        nextIds[currentIndex],
      ];
      setReorderIds(nextIds);

      try {
        setIsSavingOrder(true);
        await Promise.all(
          nextIds.map((id, index) => setTaskPriority(id, index + 1)),
        );
        await refetch();
      } catch (moveError: unknown) {
        Alert.alert(
          'Reorder Error',
          moveError instanceof Error
            ? moveError.message
            : String(moveError) || 'Failed to update task order.',
        );
        setReorderIds(reorderIds);
      } finally {
        setIsSavingOrder(false);
      }
    },
    [isSavingOrder, refetch, reorderIds, reorderMode, setTaskPriority],
  );

  const keyExtractor = useCallback((item: string) => item, []);

  const renderTaskItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <TaskListRow
        taskId={item}
        handleTaskPress={handleTaskPress}
        handleAttachmentsPress={handleAttachmentsPress}
        handleInfoPress={handleInfoPress}
        handleRevokePress={handleRevokePress}
        handleMoveTask={handleMoveTask}
        refetch={refetch}
        reorderMode={reorderMode}
        canReorder={canReorder}
        canMoveUp={index > 0}
        canMoveDown={index < visibleTasks.length - 1}
      />
    ),
    [
      canReorder,
      handleAttachmentsPress,
      handleInfoPress,
      handleMoveTask,
      handleTaskPress,
      handleRevokePress,
      reorderMode,
      refetch,
      visibleTasks.length,
    ],
  );

  const renderFilterTabs = () => (
    <View
      style={[
        styles.filterContainer,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {FILTER_TABS.map(tab => (
          <FilterTabPill
            key={tab.id}
            tab={tab}
            isActive={activeTab.id === tab.id}
            count={counts[tab.id as keyof TaskListCounts]}
            theme={theme}
            onSelect={handleFilterTabSelect}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      {lockedFilter && (
        <View
          style={[
            styles.titleContainer,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
              paddingTop: Math.max(insets.top, 16) + 4,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {metadata.title}
          </Text>
        </View>
      )}

      {lockedFilter && initialFilter === 'IN_PROGRESS' && (
        <View
          style={[
            styles.sortContainer,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.sortLabel, { color: theme.colors.textSecondary }]}
          >
            Sort by:
          </Text>
          <TouchableOpacity
            style={[
              styles.sortButton,
              {
                backgroundColor:
                  sortMode === 'order'
                    ? theme.colors.primary
                    : theme.colors.surfaceAlt,
              },
            ]}
            onPress={() => setSortMode('order')}
          >
            <Text
              style={[
                styles.sortButtonText,
                {
                  color:
                    sortMode === 'order'
                      ? theme.colors.surface
                      : theme.colors.textSecondary,
                },
              ]}
            >
              Order
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sortButton,
              {
                backgroundColor:
                  sortMode === 'priority'
                    ? theme.colors.primary
                    : theme.colors.surfaceAlt,
              },
            ]}
            onPress={() => setSortMode('priority')}
          >
            <Text
              style={[
                styles.sortButtonText,
                {
                  color:
                    sortMode === 'priority'
                      ? theme.colors.surface
                      : theme.colors.textSecondary,
                },
              ]}
            >
              Priority
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {canReorder && (
        <View
          style={[
            styles.reorderContainer,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.reorderLabel, { color: theme.colors.textSecondary }]}
          >
            Card Reorder:
          </Text>
          <TouchableOpacity
            style={[
              styles.reorderToggleBtn,
              {
                backgroundColor: reorderMode
                  ? theme.colors.primary
                  : theme.colors.surfaceAlt,
              },
              isSavingOrder && styles.reorderToggleBtnDisabled,
            ]}
            onPress={() => setReorderMode(prev => !prev)}
            disabled={isSavingOrder}
          >
            <Text
              style={[
                styles.reorderToggleText,
                {
                  color: reorderMode
                    ? theme.colors.surface
                    : theme.colors.textSecondary,
                },
              ]}
            >
              {reorderMode ? 'Done' : 'Select & Move'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.searchInputWrapper,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Icon
            name="search-outline"
            size={20}
            color={theme.colors.textMuted}
          />
          <UppercaseTextInput
            name="task-search"
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder={metadata.searchPlaceholder}
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            // U7 (audit 2026-04-21 round 2): added hitSlop so the 20px
            // icon has a full 44×44 tappable area, plus a11y label.
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon
                name="close-circle"
                size={20}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!lockedFilter && renderFilterTabs()}

      {isLoading ? (
        <ScrollView style={styles.listContainer}>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
          <TaskCardSkeleton />
          <Text
            style={[styles.loadingText, { color: theme.colors.textSecondary }]}
          >
            Loading tasks...
          </Text>
        </ScrollView>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Icon
            name="alert-circle-outline"
            size={48}
            color={theme.colors.danger}
          />
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={refetch}
            activeOpacity={0.85}
          >
            <Text style={[styles.retryText, { color: theme.colors.surface }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : visibleTasks.length === 0 ? (
        <View style={styles.centerContainer}>
          <Icon
            name="document-text-outline"
            size={48}
            color={theme.colors.textMuted}
          />
          <Text
            style={[styles.emptyText, { color: theme.colors.textSecondary }]}
          >
            {searchQuery
              ? `No cases found matching "${searchQuery}"`
              : metadata.emptyMessage}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleTasks}
          keyExtractor={keyExtractor}
          renderItem={renderTaskItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={8}
          removeClippedSubviews
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: Math.max(insets.bottom, 16) + 80 },
          ]}
          refreshing={isLoading}
          onRefresh={refetch}
        />
      )}

      <TaskInfoModal
        visible={Boolean(selectedInfoTask)}
        task={selectedInfoTask}
        onClose={() => setSelectedInfoTask(null)}
      />

      <TaskRevokeModal
        visible={Boolean(selectedRevokeTask)}
        isRevoking={isRevokingTask}
        onClose={() => setSelectedRevokeTask(null)}
        onRevoke={handleRevokeConfirm}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  titleContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  // U9 (audit 2026-04-21 round 2): raise padding + minHeight to meet
  // 44×44 target for sort-order buttons.
  sortButton: {
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reorderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  reorderLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  reorderToggleBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reorderToggleBtnDisabled: {
    opacity: 0.6,
  },
  reorderToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 8,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  filterTab: {
    // U6 (audit 2026-04-21 round 2): raised to 44 min-height +
    // centered content so the 5 filter pills at the top of every
    // task list satisfy the 44×44 touch-target guideline. Previous
    // paddingVertical: 7 gave ~28 px.
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    marginRight: 8,
    justifyContent: 'center',
  },
  activeFilterTab: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  activeFilterText: {
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  listContainer: {
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    marginVertical: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '500',
  },
});
