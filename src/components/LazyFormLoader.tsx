import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

const LazyFormLoader: React.FC = () => (
  <View style={styles.container}>
    <ActivityIndicator />
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: 'center',
  },
});

export default LazyFormLoader;
