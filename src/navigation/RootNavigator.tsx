import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import Icon from 'react-native-vector-icons/Ionicons';

import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { TaskListScreen } from '../screens/tasks/TaskListScreen';
import { TaskDetailScreen } from '../screens/tasks/TaskDetailScreen';
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
  } else if (route.name === 'Tasks') {
    iconName = focused ? 'list' : 'list-outline';
  } else if (route.name === 'Profile') {
    iconName = focused ? 'person' : 'person-outline';
  }

  return <Icon name={iconName} size={size} color={color} />;
};

const getTabScreenOptions = ({ route }: any, theme: any) => ({
  tabBarIcon: (props: any) => <TabBarIcon route={route} {...props} />,
  tabBarActiveTintColor: theme.colors.primary,
  tabBarInactiveTintColor: theme.colors.textMuted,
  headerShown: true,
  tabBarStyle: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
  },
  headerStyle: {
    backgroundColor: theme.colors.surface,
  },
  headerTintColor: theme.colors.text,
});

const MainTabs = () => {
  const { theme } = useTheme();
  
  return (
    <Tab.Navigator screenOptions={(props) => getTabScreenOptions(props, theme)}>
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen} 
        options={{ title: 'Overview' }}
      />
      <Tab.Screen 
        name="Tasks" 
        component={TaskListScreen} 
        options={{ title: 'Tasks' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export const RootNavigator = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme } = useTheme();
  
  const [isVersionChecking, setIsVersionChecking] = useState(true);
  const [versionResult, setVersionResult] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Only check version if auth is resolved
    if (authLoading) return;

    const checkAppVersion = async () => {
      try {
        const result = await VersionService.checkVersion();
        setVersionResult(result);
      } catch (e) {
        console.error('Failed to check version:', e);
      } finally {
        setIsVersionChecking(false);
      }
    };

    checkAppVersion();
  }, [authLoading, isAuthenticated]);

  if (authLoading || isVersionChecking) {
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
