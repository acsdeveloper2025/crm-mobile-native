import React, { useState, useCallback, useEffect, useMemo, useDeferredValue } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTasks } from '../../hooks/useTasks';
import { TaskCard } from '../../components/tasks/TaskCard';
import { TaskCardSkeleton } from '../../components/ui/Skeleton';
import { LocalTask } from '../../types/mobile';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTaskManager } from '../../context/TaskContext';
import { TaskRepository, type TaskListCounts } from '../../repositories/TaskRepository';

// Updated tab bar filters for tasks to include Saved and Revoked
const FILTER_TABS = [
  { id: 'ALL', label: 'All', value: undefined },
  { id: 'ASSIGNED', label: 'Assigned', value: 'ASSIGNED' },
  { id: 'IN_PROGRESS', label: 'In Progress', value: 'IN_PROGRESS' },
  { id: 'COMPLETED', label: 'Completed', value: 'COMPLETED' },
  { id: 'SAVED', label: 'Saved', value: 'SAVED' },
];

export const TaskListScreen = ({
  navigation,
  defaultFilter,
  defaultLockedFilter,
  defaultSearchPlaceholder,
}: any) => {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const initialFilter = route.params?.filter ?? defaultFilter;
  const initialTab = FILTER_TABS.find(tab => tab.value === initialFilter) || FILTER_TABS[0];
  const lockedFilter = Boolean(route.params?.lockedFilter ?? defaultLockedFilter);
  const [sortMode, setSortMode] = useState<'order' | 'priority'>('order');
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [counts, setCounts] = useState<TaskListCounts>({
    ALL: 0,
    ASSIGNED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    SAVED: 0,
  });
  const insets = useSafeAreaInsets();
  const { setTaskPriority } = useTaskManager();
  
  const statusFilter = lockedFilter ? initialFilter : activeTab.value;
  const { tasks, isLoading, error, refetch } = useTasks(statusFilter, deferredSearchQuery);
  const canReorder = lockedFilter && (initialFilter === 'ASSIGNED' || initialFilter === 'IN_PROGRESS');

  useEffect(() => {
    if (route.params?.filter) {
      const tab = FILTER_TABS.find(t => t.value === route.params?.filter);
      if (tab) setActiveTab(tab);
    }
  }, [route.params?.filter]);

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
        searchPlaceholder: defaultSearchPlaceholder || 'Search assigned tasks...',
      };
    }
    if (initialFilter === 'IN_PROGRESS') {
      return {
        title: 'In Progress Tasks',
        emptyMessage: 'No cases are currently in progress.',
        searchPlaceholder: defaultSearchPlaceholder || 'Search in progress tasks...',
      };
    }
    if (initialFilter === 'SAVED') {
      return {
        title: 'Saved for Offline',
        emptyMessage: "Use the Save button on a case in the In Progress tab to save it for offline use.",
        searchPlaceholder: defaultSearchPlaceholder || 'Search saved tasks...',
      };
    }
    if (initialFilter === 'COMPLETED') {
      return {
        title: 'Completed Tasks',
        emptyMessage: 'You have not completed any cases yet.',
        searchPlaceholder: defaultSearchPlaceholder || 'Search completed tasks...',
      };
    }
    return {
      title: 'All Cases',
      emptyMessage: 'No tasks found for this status.',
      searchPlaceholder: 'Search cases...',
    };
  }, [defaultSearchPlaceholder, initialFilter, lockedFilter]);

  const renderedTasks = useMemo(() => {
    if (initialFilter !== 'IN_PROGRESS' || !lockedFilter || sortMode === 'order') {
      return tasks;
    }

    return [...tasks].sort((left, right) => {
      const leftPriority = left.priority ? Number(left.priority) : 0;
      const rightPriority = right.priority ? Number(right.priority) : 0;
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
  }, [initialFilter, lockedFilter, sortMode, tasks]);

  useEffect(() => {
    if (!reorderMode) {
      return;
    }

    const sortedByPriority = [...renderedTasks].sort((left, right) => {
      const leftPriority = left.priority ? Number(left.priority) : 0;
      const rightPriority = right.priority ? Number(right.priority) : 0;

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

    setReorderIds(sortedByPriority.map((task: LocalTask) => task.id));
  }, [reorderMode, renderedTasks]);

  const visibleTasks = useMemo(() => {
    if (!reorderMode) {
      return renderedTasks;
    }

    const map = new Map(renderedTasks.map((task: LocalTask) => [task.id, task]));
    const ordered = reorderIds
      .map(id => map.get(id))
      .filter((task): task is LocalTask => Boolean(task));
    const remaining = renderedTasks.filter((task: LocalTask) => !reorderIds.includes(task.id));
    return [...ordered, ...remaining];
  }, [reorderIds, renderedTasks, reorderMode]);

  useFocusEffect(
    useCallback(() => {
      const fetchCounts = async () => {
        try {
          setCounts(await TaskRepository.getTaskListCounts());
        } catch (err) {
           console.error("Error fetching tab counts", err);
        }
      };
      
      fetchCounts();
    }, [])
  );

  const handleTaskPress = useCallback((task: LocalTask) => {
    if (task.status === 'IN_PROGRESS' || task.status === 'REVISIT') {
      navigation.navigate('VerificationForm', { taskId: task.id });
      return;
    }
    if (
      task.status === 'ASSIGNED' ||
      task.status === 'COMPLETED' ||
      task.status === 'REVOKED' ||
      task.is_saved === 1
    ) {
      return;
    }
    navigation.navigate('TaskDetail', { taskId: task.id });
  }, [navigation]);

  const handleAttachmentsPress = useCallback((task: LocalTask) => {
    navigation.navigate('TaskAttachments', {
      taskId: task.id,
      taskNumber: task.verificationTaskNumber || `#${task.caseId}`,
    });
  }, [navigation]);

  const handleMoveTask = useCallback(async (taskId: string, direction: 'up' | 'down') => {
    if (!reorderMode || isSavingOrder) {
      return;
    }

    const currentIndex = reorderIds.indexOf(taskId);
    if (currentIndex < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= reorderIds.length) {
      return;
    }

    const nextIds = [...reorderIds];
    [nextIds[currentIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[currentIndex]];
    setReorderIds(nextIds);

    try {
      setIsSavingOrder(true);
      await Promise.all(nextIds.map((id, index) => setTaskPriority(id, index + 1)));
      await refetch();
    } catch (moveError: any) {
      Alert.alert('Reorder Error', moveError?.message || 'Failed to update task order.');
      setReorderIds(reorderIds);
    } finally {
      setIsSavingOrder(false);
    }
  }, [isSavingOrder, refetch, reorderIds, reorderMode, setTaskPriority]);

  const keyExtractor = useCallback((item: LocalTask) => item.id, []);

  const renderTaskItem = useCallback(
    ({ item, index }: { item: LocalTask; index: number }) => (
      <TaskCard
        task={item}
        onPress={handleTaskPress}
        onStatusChange={refetch}
        onAttachmentsPress={handleAttachmentsPress}
        isReorderEnabled={reorderMode && canReorder}
        canMoveUp={index > 0}
        canMoveDown={index < visibleTasks.length - 1}
        onMoveUp={() => handleMoveTask(item.id, 'up')}
        onMoveDown={() => handleMoveTask(item.id, 'down')}
      />
    ),
    [
      canReorder,
      handleAttachmentsPress,
      handleMoveTask,
      handleTaskPress,
      reorderMode,
      refetch,
      visibleTasks.length,
    ],
  );

  const renderFilterTabs = () => (
    <View style={[styles.filterContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.filterTab,
              { backgroundColor: theme.colors.surfaceAlt },
              activeTab.id === tab.id && [styles.activeFilterTab, { backgroundColor: theme.colors.primary }]
            ]}
            onPress={() => setActiveTab(tab)}>
            <Text
              style={[
                styles.filterText,
                { color: theme.colors.textSecondary },
                activeTab.id === tab.id && [styles.activeFilterText, { color: theme.colors.surface }]
              ]}>
              {tab.label} {counts[tab.id as keyof TaskListCounts] !== undefined ? `(${counts[tab.id as keyof TaskListCounts]})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {lockedFilter && (
        <View style={[styles.titleContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{metadata.title}</Text>
        </View>
      )}

      {lockedFilter && initialFilter === 'IN_PROGRESS' && (
        <View style={[styles.sortContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.sortLabel, { color: theme.colors.textSecondary }]}>Sort by:</Text>
          <TouchableOpacity
            style={[styles.sortButton, { backgroundColor: sortMode === 'order' ? theme.colors.primary : theme.colors.surfaceAlt }]}
            onPress={() => setSortMode('order')}>
            <Text style={[styles.sortButtonText, { color: sortMode === 'order' ? theme.colors.surface : theme.colors.textSecondary }]}>Order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, { backgroundColor: sortMode === 'priority' ? theme.colors.primary : theme.colors.surfaceAlt }]}
            onPress={() => setSortMode('priority')}>
            <Text style={[styles.sortButtonText, { color: sortMode === 'priority' ? theme.colors.surface : theme.colors.textSecondary }]}>Priority</Text>
          </TouchableOpacity>
        </View>
      )}

      {canReorder && (
        <View style={[styles.reorderContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.reorderLabel, { color: theme.colors.textSecondary }]}>
            Card Reorder:
          </Text>
          <TouchableOpacity
            style={[
              styles.reorderToggleBtn,
              { backgroundColor: reorderMode ? theme.colors.primary : theme.colors.surfaceAlt },
              isSavingOrder && styles.reorderToggleBtnDisabled,
            ]}
            onPress={() => setReorderMode(prev => !prev)}
            disabled={isSavingOrder}>
            <Text
              style={[
                styles.reorderToggleText,
                { color: reorderMode ? theme.colors.surface : theme.colors.textSecondary },
              ]}>
              {reorderMode ? 'Done' : 'Select & Move'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <View style={[styles.searchInputWrapper, { backgroundColor: theme.colors.background }]}>
          <Icon name="search-outline" size={20} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder={metadata.searchPlaceholder}
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length> 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={20} color={theme.colors.textMuted} />
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
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading tasks...</Text>
        </ScrollView>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Icon name="alert-circle-outline" size={48} color={theme.colors.danger} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: theme.colors.primary }]} 
            onPress={refetch}
            activeOpacity={0.85}>
            <Text style={[styles.retryText, { color: theme.colors.surface }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : visibleTasks.length === 0 ? (
        <View style={styles.centerContainer}>
          <Icon name="document-text-outline" size={48} color={theme.colors.textMuted} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            {searchQuery ? `No cases found matching "${searchQuery}"` : metadata.emptyMessage}
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
          contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(insets.bottom, 16) + 80 }]}
          refreshing={isLoading}
          onRefresh={refetch}
        />
      )}
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
  sortButton: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
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
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
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
  }
});
