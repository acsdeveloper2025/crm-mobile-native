/**
 * CRM Mobile Native - Field Verification App
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { TaskProvider } from './src/context/TaskContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { DatabaseService } from './src/database/DatabaseService';
import { NetworkService } from './src/services/NetworkService';
import { CameraService } from './src/services/CameraService';
import { Logger } from './src/utils/logger';
import { notificationService } from './src/services/NotificationService';
import { SyncQueue } from './src/services/SyncQueue';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ProjectionUpdater } from './src/projections/ProjectionUpdater';
import { BackgroundSyncDaemon } from './src/sync/BackgroundSyncDaemon';
import { MobileTelemetryService } from './src/telemetry/MobileTelemetryService';

const TAG = 'App';
const STARTUP_PERMISSIONS_KEY = 'startup_permissions_requested_v1';

const getStoredFlag = async (key: string): Promise<string | null> => {
  const rows = await DatabaseService.query<{ value: string }>(
    'SELECT value FROM key_value_store WHERE key = ?',
    [key],
  );
  return rows[0]?.value || null;
};

const setStoredFlag = async (key: string, value: string): Promise<void> => {
  await DatabaseService.execute(
    'INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)',
    [key, value],
  );
};

const requestStartupPermissionsIfNeeded = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }

  const alreadyRequested = await getStoredFlag(STARTUP_PERMISSIONS_KEY);
  if (alreadyRequested === '1') {
    return;
  }

  const denied: string[] = [];

  const locationResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission',
      message: 'Location is required for visit start, geo-tagging, and form submission.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  if (locationResult !== PermissionsAndroid.RESULTS.GRANTED) {
    denied.push('Location');
  }

  const cameraResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera Permission',
      message: 'Camera is required to capture verification photos and selfies.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  if (cameraResult !== PermissionsAndroid.RESULTS.GRANTED) {
    denied.push('Camera');
  }

  if (Number(Platform.Version) >= 33) {
    const notificationResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Notification Permission',
        message: 'Notifications are required for new task and sync alerts.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    if (notificationResult !== PermissionsAndroid.RESULTS.GRANTED) {
      denied.push('Notifications');
    }
  }

  await setStoredFlag(STARTUP_PERMISSIONS_KEY, '1');

  if (denied.length > 0) {
    Alert.alert(
      'Permissions Required',
      `${denied.join(', ')} permission denied. Some features may not work until enabled in Settings.`,
    );
  }
};

function App(): React.JSX.Element {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      try {
        Logger.info(TAG, 'Starting app initialization...');

        await DatabaseService.initialize();
        Logger.info(TAG, 'Database initialized');

        await SyncQueue.recoverExpiredLeases();
        Logger.info(TAG, 'Queue lease recovery completed');

        await ProjectionUpdater.rebuildAll();
        Logger.info(TAG, 'Projection rebuild completed');

        NetworkService.initialize();
        Logger.info(TAG, 'Network monitoring started');

        await notificationService.loadFromDb();
        notificationService.initializePushListeners();
        Logger.info(TAG, 'Notification service initialized');

        await BackgroundSyncDaemon.start();
        Logger.info(TAG, 'Background sync daemon started');

        MobileTelemetryService.initialize();
        Logger.info(TAG, 'Mobile telemetry initialized');

        if (mounted) {
          setIsInitializing(false);
        }

        // Non-blocking startup tasks (do not delay first app paint)
        CameraService.initialize()
          .then(() => Logger.info(TAG, 'Camera service initialized'))
          .catch(error => Logger.warn(TAG, 'Camera service deferred init failed', error));

        requestStartupPermissionsIfNeeded()
          .then(() => Logger.info(TAG, 'Startup permission check completed'))
          .catch(error => Logger.warn(TAG, 'Startup permission check failed', error));
      } catch (error: any) {
        Logger.error(TAG, 'Initialization failed', error);
        if (mounted) {
          setInitError(error?.message || 'Failed to initialize app');
          setIsInitializing(false);
        }
      }
    };

    initializeApp();

    return () => {
      mounted = false;
      NetworkService.destroy();
      notificationService.destroyPushListeners();
      void BackgroundSyncDaemon.stop();
    };
  }, []);

  if (isInitializing) {
    return (
      <SafeAreaProvider>
        <View style={[styles.container, styles.center, styles.loadingBackground]}>
          <StatusBar barStyle="dark-content" />
          <ActivityIndicator size="large" color="#00a950" />
          <Text style={styles.initText}>Initializing...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (initError) {
    return (
      <SafeAreaProvider>
        <View style={[styles.container, styles.center, styles.loadingBackground]}>
          <StatusBar barStyle="dark-content" />
          <Text style={styles.errorText}>Initialization Error</Text>
          <Text style={styles.errorDetail}>{initError}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <TaskProvider>
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          </TaskProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingBackground: {
    backgroundColor: '#ffffff',
  },
  initText: {
    marginTop: 16,
    fontSize: 16,
    color: '#4b5563',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#dc2626',
  },
  errorDetail: {
    fontSize: 14,
    textAlign: 'center',
    color: '#4b5563',
  },
});

export default App;
