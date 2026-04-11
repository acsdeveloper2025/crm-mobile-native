import React, { createContext, useContext } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  StatusBar as RNStatusBar,
  StatusBarStyle,
} from 'react-native';
import {
  SafeAreaProvider as RNSafeAreaProvider,
  SafeAreaView as RNSafeAreaView,
  useSafeAreaInsets,
  Edge,
} from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

interface DeviceInfo {
  platform: string;
  hasHomeIndicator: boolean;
}

interface SafeAreaContextType {
  deviceInfo: DeviceInfo;
  isNative: boolean;
}

const SafeAreaContext = createContext<SafeAreaContextType>({
  deviceInfo: {
    platform: Platform.OS,
    hasHomeIndicator: Platform.OS === 'ios',
  },
  isNative: true,
});

export const useSafeArea = () => {
  const insets = useSafeAreaInsets();
  const context = useContext(SafeAreaContext);
  return { ...context, insets };
};

interface SafeAreaProviderProps {
  children: React.ReactNode;
}

export const SafeAreaProvider: React.FC<SafeAreaProviderProps> = ({
  children,
}) => {
  const { isDark } = useTheme();

  return (
    <RNSafeAreaProvider>
      <RNStatusBar
        barStyle={isDark ? 'light-content' : ('dark-content' as StatusBarStyle)}
        backgroundColor="transparent"
        translucent
      />
      <SafeAreaContext.Provider
        value={{
          deviceInfo: {
            platform: Platform.OS,
            hasHomeIndicator: Platform.OS === 'ios',
          },
          isNative: true,
        }}
      >
        {children}
      </SafeAreaContext.Provider>
    </RNSafeAreaProvider>
  );
};

interface SafeAreaViewProps {
  children: React.ReactNode;
  style?: object;
  edges?: Edge[];
}

export const SafeAreaView: React.FC<SafeAreaViewProps> = ({
  children,
  style = {},
  edges = ['top', 'bottom', 'left', 'right'],
}) => {
  return (
    <RNSafeAreaView style={[styles.flex1, style]} edges={edges}>
      {children}
    </RNSafeAreaView>
  );
};

interface MobileContainerProps {
  children: React.ReactNode;
  style?: object;
}

export const MobileContainer: React.FC<MobileContainerProps> = ({
  children,
  style = {},
}) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.flex1,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
});
