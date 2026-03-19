jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
  requestAuthorization: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => {}),
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  }),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}),
  getToken: jest.fn().mockResolvedValue('test-token'),
  registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(undefined),
  requestPermission: jest.fn().mockResolvedValue(1),
}));

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  CachesDirectoryPath: '/tmp/cache',
  exists: jest.fn().mockResolvedValue(false),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ size: 0, mtime: new Date() }),
  unlink: jest.fn().mockResolvedValue(undefined),
  moveFile: jest.fn().mockResolvedValue(undefined),
  getFSInfo: jest.fn().mockResolvedValue({ freeSpace: 1024 * 1024 * 1024 }),
  downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn().mockResolvedValue(false),
  setGenericPassword: jest.fn().mockResolvedValue(true),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  },
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  createResizedImage: jest.fn().mockResolvedValue({ uri: '/tmp/resized.jpg' }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const Camera = React.forwardRef(() => null);
  Camera.requestCameraPermission = jest.fn().mockResolvedValue('granted');
  return {
    Camera,
    useCameraDevice: jest.fn(() => null),
    useCameraFormat: jest.fn(() => null),
  };
});

jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  default: () => null,
  captureRef: jest.fn().mockResolvedValue('/tmp/capture.png'),
}));

jest.mock('react-native-sqlite-storage', () => {
  const executeSql = jest.fn().mockResolvedValue([
    {
      rows: {
        length: 0,
        item: () => ({ user_version: 0 }),
      },
      rowsAffected: 0,
      insertId: undefined,
    },
  ]);

  return {
    enablePromise: jest.fn(),
    openDatabase: jest.fn().mockResolvedValue({
      executeSql,
      close: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

jest.mock('./src/services/AuthService', () => ({
  __esModule: true,
  AuthService: {
    initialize: jest.fn().mockResolvedValue(false),
    getCurrentUser: jest.fn().mockReturnValue(null),
    login: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    logout: jest.fn().mockResolvedValue(undefined),
    isAuthenticated: jest.fn().mockReturnValue(false),
    updateProfilePhoto: jest.fn().mockResolvedValue(null),
  },
  default: {
    initialize: jest.fn().mockResolvedValue(false),
    getCurrentUser: jest.fn().mockReturnValue(null),
    login: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    logout: jest.fn().mockResolvedValue(undefined),
    isAuthenticated: jest.fn().mockReturnValue(false),
    updateProfilePhoto: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('./src/services/SyncService', () => ({
  __esModule: true,
  SyncService: {
    startPeriodicSync: jest.fn(),
    stopPeriodicSync: jest.fn(),
    performSync: jest.fn().mockResolvedValue({ success: true, errors: [] }),
  },
  default: {
    startPeriodicSync: jest.fn(),
    stopPeriodicSync: jest.fn(),
    performSync: jest.fn().mockResolvedValue({ success: true, errors: [] }),
  },
}));

jest.mock('./src/sync/BackgroundSyncDaemon', () => ({
  BackgroundSyncDaemon: {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    runHeadlessTask: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./src/telemetry/MobileTelemetryService', () => ({
  MobileTelemetryService: {
    initialize: jest.fn(),
    trackBackgroundSyncStat: jest.fn(),
    trackQueueBacklog: jest.fn(),
    trackQueueSuccess: jest.fn(),
    trackQueueFailure: jest.fn(),
  },
}));

jest.mock('./src/services/NotificationService', () => ({
  notificationService: {
    ensureLoaded: jest.fn().mockResolvedValue(undefined),
    initializePushListeners: jest.fn(),
    setAssignmentSyncHandler: jest.fn(),
    registerCurrentDevice: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./src/services/SyncQueue', () => ({
  SyncQueue: {
    recoverExpiredLeases: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('./src/services/NetworkService', () => ({
  NetworkService: {
    initialize: jest.fn(),
    getIsOnline: jest.fn().mockReturnValue(true),
    checkConnection: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('./src/services/CameraService', () => ({
  CameraService: {
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));
