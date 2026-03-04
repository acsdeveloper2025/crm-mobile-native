import React from 'react';
import { View, ActivityIndicator } from 'react-native';

const LazyFormLoader: React.FC = () => (
  <View style={{ padding: 16, alignItems: 'center' }}>
    <ActivityIndicator />
  </View>
);

export default LazyFormLoader;
