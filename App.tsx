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

const TAG = 'App';

function App(): React.JSX.Element {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        Logger.info(TAG, 'Starting app initialization...');

        await DatabaseService.initialize();
        Logger.info(TAG, 'Database initialized');

        NetworkService.initialize();
        Logger.info(TAG, 'Network monitoring started');

        await CameraService.initialize();
        Logger.info(TAG, 'Camera service initialized');
      } catch (error: any) {
        Logger.error(TAG, 'Initialization failed', error);
        setInitError(error?.message || 'Failed to initialize app');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeApp();

    return () => {
      NetworkService.destroy();
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
            <RootNavigator />
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
