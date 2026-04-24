/**
 * @format
 */

import 'react-native-get-random-values';
// Install the UPPERCASE wrappers on react-native's `Text` and `TextInput`
// exports BEFORE any screen module is loaded by `import App`. The patch
// self-runs at module load; importing for side effect only.
import './src/utils/installUppercaseDefaults';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { BackgroundSyncDaemon } from './src/sync/BackgroundSyncDaemon';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('BackgroundSyncTask', () => async () => {
  await BackgroundSyncDaemon.runHeadlessTask();
});
