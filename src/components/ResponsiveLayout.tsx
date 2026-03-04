import React, { createContext, useContext } from 'react';
import { View, Text } from 'react-native';

interface ScreenDimensions {
  width: number;
  height: number;
  isLandscape: boolean;
  isTablet: boolean;
  isSmallScreen: boolean;
}

interface ResponsiveLayoutContextType {
  screen: ScreenDimensions;
  safeAreaAdjustedHeight: number;
}

const defaultValue: ResponsiveLayoutContextType = {
  screen: {
    width: 0,
    height: 0,
    isLandscape: false,
    isTablet: false,
    isSmallScreen: true,
  },
  safeAreaAdjustedHeight: 0,
};

const ResponsiveLayoutContext = createContext<ResponsiveLayoutContextType>(defaultValue);

export const useResponsiveLayout = () => useContext(ResponsiveLayoutContext);

export const ResponsiveLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ResponsiveLayoutContext.Provider value={defaultValue}>
    {children}
  </ResponsiveLayoutContext.Provider>
);

export const ResponsiveContainer: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View style={style}>{children}</View>
);

export const ResponsiveGrid: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View style={style}>{children}</View>
);

export const ResponsiveText: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <Text style={style}>{children}</Text>
);

export const ResponsiveSpacing: React.FC = () => <View />;

export const useResponsiveValue = <T,>(values: { mobile: T; tablet?: T; desktop?: T }): T =>
  values.mobile;

export default ResponsiveLayoutProvider;
