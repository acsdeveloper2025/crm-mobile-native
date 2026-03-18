import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from 'react-native-vector-icons/Ionicons';

import { useAuth } from '../context/AuthContext';
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
import { VersionService, UpdateInfo } from '../services/VersionService';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabBarIcon = ({ route, focused, color, size }: any) => {
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

  return <Icon name={iconName} size={size} color={color} />;
};

const getTabScreenOptions = ({ route }: any, theme: any, insets: { bottom: number }) => ({
  tabBarIcon: (props: any) => <TabBarIcon route={route} {...props} />,
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
      screenOptions={(props) => getTabScreenOptions(props, theme, insets)}
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

export const RootNavigator = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme } = useTheme();
  
  const [versionResult, setVersionResult] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkAppVersion = async () => {
      try {
        const result = await VersionService.checkVersion();
        if (isMounted) {
          setVersionResult(result);
        }
      } catch (e) {
        console.error('Failed to check version:', e);
      }
    };

    checkAppVersion();

    return () => {
      isMounted = false;
    };
  }, []);

  if (authLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
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
              releaseNotes: versionResult.releaseNotes 
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen 
              name="TaskDetail" 
              component={TaskDetailScreen} 
              options={{ headerShown: true, title: 'Task Details', headerBackTitle: 'Back' }} 
            />
            <Stack.Screen
              name="TaskAttachments"
              component={TaskAttachmentsScreen}
              options={{ headerShown: true, title: 'Attachments', headerBackTitle: 'Back' }}
            />
            <Stack.Screen 
              name="CameraCapture" 
              component={CameraCaptureScreen} 
              options={{ headerShown: false, presentation: 'fullScreenModal' }} 
            />
            <Stack.Screen 
              name="WatermarkPreview" 
              component={WatermarkPreviewScreen} 
              options={{ headerShown: false, presentation: 'fullScreenModal' }} 
            />
            <Stack.Screen 
              name="VerificationForm" 
              component={VerificationFormScreen} 
              options={{ headerShown: true, title: 'Verification Form', headerBackTitle: 'Cancel' }} 
            />
            <Stack.Screen 
              name="SyncLogs" 
              component={SyncLogsScreen} 
              options={{ headerShown: true, title: 'Sync Diagnostics', headerBackTitle: 'Back' }} 
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ headerShown: true, title: 'Profile', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="DigitalIdCard"
              component={DigitalIdCardScreen}
              options={{ headerShown: true, title: 'Digital ID Card', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="ProfilePhotoCapture"
              component={ProfilePhotoCaptureScreen}
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
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
