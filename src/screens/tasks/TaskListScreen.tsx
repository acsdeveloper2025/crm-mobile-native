import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useTasks } from '../../hooks/useTasks';
import { TaskCard } from '../../components/tasks/TaskCard';
import { TaskCardSkeleton } from '../../components/ui/Skeleton';
import { LocalTask } from '../../types/mobile';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { DatabaseService } from '../../database/DatabaseService';

// Updated tab bar filters for tasks to include Saved and Revoked
const FILTER_TABS = [
  { id: 'ALL', label: 'All', value: undefined },
  { id: 'ASSIGNED', label: 'Assigned', value: 'ASSIGNED' },
  { id: 'IN_PROGRESS', label: 'In Progress', value: 'IN_PROGRESS' },
  { id: 'COMPLETED', label: 'Completed', value: 'COMPLETED' },
  { id: 'SAVED', label: 'Saved', value: 'SAVED' },
  { id: 'REVOKED', label: 'Revoked', value: 'REVOKED' },
];

export const TaskListScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const initialFilter = route.params?.filter;
  const initialTab = FILTER_TABS.find(tab => tab.value === initialFilter) || FILTER_TABS[0];
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  
  const { tasks, isLoading, error, refetch } = useTasks(activeTab.value, searchQuery);

  useEffect(() => {
    if (route.params?.filter) {
      const tab = FILTER_TABS.find(t => t.value === route.params?.filter);
      if (tab) setActiveTab(tab);
    }
  }, [route.params?.filter]);

  useFocusEffect(
    useCallback(() => {
      const fetchCounts = async () => {
        try {
          const results = await DatabaseService.query<{ status: string; is_saved: number; is_revoked: number; count: number }>(
            "SELECT status, is_saved, is_revoked, COUNT(*) as count FROM tasks GROUP BY status, is_saved, is_revoked"
          );
          
          let all = 0, assigned = 0, inProgress = 0, completed = 0, saved = 0, revoked = 0;
          
          results.forEach(row => {
            if (row.is_revoked) {
              revoked += row.count;
            } else if (row.is_saved && row.status !== 'COMPLETED') {
              saved += row.count;
            } else if (row.status === 'ASSIGNED') {
              assigned += row.count;
            } else if (row.status === 'IN_PROGRESS') {
              inProgress += row.count;
            } else if (row.status === 'COMPLETED') {
              completed += row.count;
            }
            if (!row.is_revoked) all += row.count;
          });

          setCounts({
            ALL: all,
            ASSIGNED: assigned,
            IN_PROGRESS: inProgress,
            COMPLETED: completed,
            SAVED: saved,
            REVOKED: revoked
          });
        } catch (err) {
           console.error("Error fetching tab counts", err);
        }
      };
      
      fetchCounts();
    }, [])
  );

  const handleTaskPress = (task: LocalTask) => {
    navigation.navigate('TaskDetail', { taskId: task.id });
  };

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
              {tab.label} {counts[tab.id] !== undefined ? `(${counts[tab.id]})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <View style={[styles.searchInputWrapper, { backgroundColor: theme.colors.background }]}>
          <Icon name="search-outline" size={20} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Search cases..."
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
      
      {renderFilterTabs()}
      
      {isLoading ? (
        <ScrollView style={styles.listContainer}>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
          <TaskCardSkeleton />
        </ScrollView>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Icon name="alert-circle-outline" size={48} color={theme.colors.danger} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: theme.colors.primary }]} 
            onPress={refetch}>
            <Text style={[styles.retryText, { color: theme.colors.surface }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.centerContainer}>
          <Icon name="document-text-outline" size={48} color={theme.colors.textMuted} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            {searchQuery ? `No cases found matching "${searchQuery}"` : 'No tasks found for this status.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskCard task={item} onPress={handleTaskPress} onStatusChange={refetch} />
          )}
          contentContainerStyle={styles.listContainer}
          refreshing={isLoading}
          onRefresh={refetch}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
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
