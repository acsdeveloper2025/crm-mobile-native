import React from 'react';
import { View, Text } from 'react-native';
import { APP_VERSION } from '../services/VersionService';

export interface VersionInfo {
  current: string;
  latest: string;
  buildNumber: string;
  buildDate: string;
  environment: 'development' | 'production';
}

export interface UpdateInfo {
  available: boolean;
  required: boolean;
  urgent: boolean;
  version: string;
  downloadUrl?: string;
  releaseNotes: string[];
  features: string[];
  bugFixes: string[];
}

interface VersionInfoProps {
  compact?: boolean;
}

export const VersionInfoComponent: React.FC<VersionInfoProps> = () => (
  <View>
    <Text>Version {APP_VERSION}</Text>
  </View>
);

interface CompactVersionInfoProps {
  style?: unknown;
}

export const CompactVersionInfo: React.FC<CompactVersionInfoProps> = () => (
  <View>
    <Text>{APP_VERSION}</Text>
  </View>
);

export default VersionInfoComponent;
