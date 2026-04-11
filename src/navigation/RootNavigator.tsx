import React, { useEffect, useRef, useState } from 'react';
import {
  NavigationContainer,
  type NavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import messaging from '@react-native-firebase/messaging';

import Icon from 'react-native-vector-icons/Ionicons';

import { useAuth } from '../context/AuthContext';
import { Logger } from '../utils/logger';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { ProfilePhotoCaptureScreen } from '../screens/main/ProfilePhotoCaptureScreen';
import { DigitalIdCardScreen } from '../screens/main/DigitalIdCardScreen';
import { AssignedTasksScreen } from '../screens/tasks/AssignedTasksScreen';
import { InProgressTasksScreen } from '../screens/tasks/InProgressTasksScreen';
import { SavedTasksScreen } from '../screens/tasks/SavedTasksScreen';
import { CompletedTasksScreen } from '../screens/tasks/CompletedTasksScreen';
import { TaskDetailScreen } from '../screens/tasks/TaskDetailScreen';
import { TaskAttachmentsScreen } from '../screens/tasks/TaskAttachmentsScreen';
import { CameraCaptureScreen } from '../components/media/CameraCaptureScreen';
import { WatermarkPreviewScreen } from '../components/media/WatermarkPreviewScreen';
import { VerificationFormScreen } from '../screens/forms/VerificationFormScreen';
import { ForceUpdateScreen } from '../screens/auth/ForceUpdateScreen';
import { SyncLogsScreen } from '../screens/main/SyncLogsScreen';
import { DataCleanupScreen } from '../screens/main/DataCleanupScreen';
import { VersionService, UpdateInfo } from '../services/VersionService';
import { useTheme } from '../context/ThemeContext';
import { TaskRepository } from '../repositories/TaskRepository';

// M6: shape-check a taskId from an FCM push before it drives
// navigation. FCM data fields are strings by spec but nothing stops
// an attacker (or a buggy server) from shipping a crafted payload.
// Accept UUIDs and the legacy numeric-string task ids produced by
// older backends; reject anything that could be a path traversal,
// a URL, or excessively long.
const TASK_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

const isPlausibleTaskId = (value: unknown): value is string =>
  typeof value === 'string' && TASK_ID_PATTERN.test(value);

// Typed navigation param list — replaces `any` on all route params
export type RootStackParamList = {
  Auth: undefined;
  ForceUpdate: { downloadUrl?: string; releaseNotes?: string[] };
  Main: undefined;
  TaskDetail: { taskId: string };
  TaskAttachments: { taskId: string };
  CameraCapture: {
    taskId: string;
    componentType?: 'photo' | 'selfie';
    taskMeta?: {
      caseId?: string;
      taskNumber?: string;
      customerName?: string;
      clientName?: string;
      productName?: string;
      verificationType?: string;
    };
  };
  WatermarkPreview: {
    photoPath: string;
    taskId: string;
    componentType?: 'photo' | 'selfie';
    taskMeta?: {
      caseId?: string;
      taskNumber?: string;
      customerName?: string;
      clientName?: string;
      productName?: string;
      verificationType?: string;
    };
  };
  VerificationForm: { taskId: string };
  SyncLogs: undefined;
  Profile: undefined;
  DigitalIdCard: undefined;
  DataCleanup: undefined;
  ProfilePhotoCapture: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Assigned: undefined;
  InProgress: undefined;
  Saved: undefined;
  Completed: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const getCameraScreenOptions = (): NativeStackNavigationOptions => ({
  headerShown: false,
  presentation: Platform.OS === 'ios' ? 'fullScreenModal' : 'card',
  animation: Platform.OS === 'ios' ? 'default' : 'fade',
});

const TabBarIcon = ({
  route,
  focused,
  color,
  size,
}: {
  route: { name: string };
  focused: boolean;
  color: string;
  size: number;
}) => {
  let iconName = 'list';

  if (route.name === 'Dashboard') {
    iconName = focused ? 'home' : 'home-outline';
  } else if (route.name === 'Assigned') {
    iconName = focused ? 'list' : 'list-outline';
  } else if (route.name === 'InProgress') {
    iconName = focused ? 'time' : 'time-outline';
  } else if (route.name === 'Saved') {
    iconName = focused ? 'star' : 'star-outline';
  } else if (route.name === 'Completed') {
    iconName = focused ? 'checkmark-circle' : 'checkmark-circle-outline';
  }

  return (
    <Icon
      name={iconName}
      size={size}
      color={color}
      testID={`tab-icon-${route.name}`}
    />
  );
};

const getTabScreenOptions = (
  { route }: { route: { name: string } },
  theme: ReturnType<typeof useTheme>['theme'],
  insets: { bottom: number },
) => ({
  tabBarIcon: (props: { focused: boolean; color: string; size: number }) => (
    <TabBarIcon route={route} {...props} />
  ),
  tabBarActiveTintColor: theme.colors.primary,
  tabBarInactiveTintColor: theme.colors.textMuted,
  headerShown: false,
  tabBarLabelStyle: {
    fontSize: 10,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  tabBarStyle: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    minHeight: 56 + Math.max(insets.bottom, 8),
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 8),
  },
  headerStyle: {
    backgroundColor: theme.colors.surface,
  },
  headerTintColor: theme.colors.text,
});

const MainTabs = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={props => getTabScreenOptions(props, theme, insets)}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="Assigned"
        component={AssignedTasksScreen}
        options={{ title: 'Assigned Tasks', tabBarLabel: 'Assigned' }}
      />
      <Tab.Screen
        name="InProgress"
        component={InProgressTasksScreen}
        options={{ title: 'In Progress Tasks', tabBarLabel: 'In Progress' }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedTasksScreen}
        options={{ title: 'Saved for Offline', tabBarLabel: 'Saved' }}
      />
      <Tab.Screen
        name="Completed"
        component={CompletedTasksScreen}
        options={{ title: 'Completed Tasks', tabBarLabel: 'Completed' }}
      />
    </Tab.Navigator>
  );
};

// Deep linking configuration for notification-driven and URL-based navigation
const linking = {
  prefixes: ['crmapp://', 'https://crm.allcheckservices.com'],
  config: {
    screens: {
      Main: {
        screens: {
          Dashboard: 'dashboard',
          Assigned: 'assigned',
          InProgress: 'in-progress',
          Saved: 'saved',
          Completed: 'completed',
        },
      },
      TaskDetail: 'task/:taskId',
      TaskAttachments: 'task/:taskId/attachments',
      VerificationForm: 'task/:taskId/form',
      Profile: 'profile',
      SyncLogs: 'sync-logs',
    },
  },
};

// Exported navigation ref for use outside React tree (e.g., notification handlers)
export const navigationRef =
  React.createRef<NavigationContainerRef<RootStackParamList>>();

export const RootNavigator = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isNavigationReady = useRef(false);

  const [versionResult, setVersionResult] = useState<UpdateInfo | null>(null);

  // Handle push notification taps — navigate to TaskDetail when user taps a notification.
  //
  // M6: before navigating, shape-check the taskId and verify the
  // task actually exists in the local DB. Without this, a crafted
  // push with taskId='../../admin' or taskId='<1kb of junk>' would
  // drive a navigate() call that either crashes TaskDetailScreen
  // mid-render or loads a "task not found" state — either way a
  // confusing UX and a potential crash vector.
  useEffect(() => {
    const handleTaskIdNavigation = async (
      rawTaskId: unknown,
      source: string,
    ) => {
      if (!isPlausibleTaskId(rawTaskId)) {
        if (rawTaskId != null) {
          Logger.warn('RootNavigator', `Rejected push ${source} taskId shape`, {
            sample: String(rawTaskId).slice(0, 80),
          });
        }
        return;
      }
      try {
        const identity = await TaskRepository.getTaskIdentity(rawTaskId);
        if (!identity) {
          Logger.warn(
            'RootNavigator',
            `Push ${source} taskId not in local DB — skipping deep link`,
            { taskId: rawTaskId },
          );
          return;
        }
      } catch (err) {
        Logger.warn('RootNavigator', `Task lookup failed for ${source}`, err);
        return;
      }
      if (isNavigationReady.current) {
        navigationRef.current?.navigate('TaskDetail', { taskId: rawTaskId });
      }
    };

    // Handle notification that opened the app from quit state
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        handleTaskIdNavigation(remoteMessage?.data?.taskId, 'initial');
      })
      .catch(err =>
        Logger.warn('RootNavigator', 'getInitialNotification failed', err),
      );

    // Handle notification taps when app is in background
    const unsubscribe = messaging().onNotificationOpenedApp(remoteMessage => {
      handleTaskIdNavigation(remoteMessage?.data?.taskId, 'opened');
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAppVersion = async () => {
      try {
        const result = await VersionService.checkVersion();
        console.warn(
          '[VERSION_DEBUG]',
          JSON.stringify({
            forceUpdate: result.forceUpdate,
            updateRequired: result.updateRequired,
            version: result.version,
          }),
        );
        if (isMounted) {
          setVersionResult(result);
        }
      } catch (e) {
        console.warn('[VERSION_DEBUG] ERROR', e);
        Logger.error('RootNavigator', 'Failed to check version', e);
      }
    };

    checkAppVersion();

    return () => {
      isMounted = false;
    };
  }, []);

  if (authLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={theme.colors.primary}
          testID="auth-loading"
        />
      </View>
    );
  }

  // HARD BLOCK: The app is deprecated.
  if (versionResult?.forceUpdate) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="ForceUpdate"
            component={ForceUpdateScreen}
            initialParams={{
              downloadUrl: versionResult.downloadUrl,
              releaseNotes: versionResult.releaseNotes,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={() => {
        isNavigationReady.current = true;
      }}
    >
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'none' }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="TaskDetail"
              component={TaskDetailScreen}
              options={{
                headerShown: false,
                title: 'Task Details',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="TaskAttachments"
              component={TaskAttachmentsScreen}
              options={{
                headerShown: false,
                title: 'Attachments',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="CameraCapture"
              component={CameraCaptureScreen}
              options={getCameraScreenOptions()}
            />
            <Stack.Screen
              name="WatermarkPreview"
              component={WatermarkPreviewScreen}
              options={getCameraScreenOptions()}
            />
            <Stack.Screen
              name="VerificationForm"
              component={VerificationFormScreen}
              options={{ headerShown: false, title: 'Verification Form' }}
            />
            <Stack.Screen
              name="SyncLogs"
              component={SyncLogsScreen}
              options={{
                headerShown: false,
                title: 'Sync Diagnostics',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{
                headerShown: false,
                title: 'Profile',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="DigitalIdCard"
              component={DigitalIdCardScreen}
              options={{
                headerShown: false,
                title: 'Digital ID Card',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="DataCleanup"
              component={DataCleanupScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ProfilePhotoCapture"
              component={ProfilePhotoCaptureScreen}
              options={getCameraScreenOptions()}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
