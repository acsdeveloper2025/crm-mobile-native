/**
 * @format
 */

import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { BackgroundSyncDaemon } from './src/sync/BackgroundSyncDaemon';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('BackgroundSyncTask', () => async () => {
  await BackgroundSyncDaemon.runHeadlessTask();
});
