/**
 * @format
 */
/* global globalThis */

if (!globalThis.crypto) {
  globalThis.crypto = {};
}

if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = typedArray => {
    for (let i = 0; i < typedArray.length; i += 1) {
      typedArray[i] = Math.floor(Math.random() * 256);
    }
    return typedArray;
  };
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
