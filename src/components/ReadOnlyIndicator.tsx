import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoIcon } from './Icons';
import { TaskStatus } from '../types/index';

interface ReadOnlyIndicatorProps {
  isReadOnly: boolean;
  caseStatus: TaskStatus;
  isSaved?: boolean;
}

const ReadOnlyIndicator: React.FC<ReadOnlyIndicatorProps> = ({ 
  isReadOnly, 
  caseStatus 
}) => {
  if (!isReadOnly) return null;

  return (
    <View style={styles.container}>
      <InfoIcon width={16} height={16} color="#3b82f6" />
      <Text style={styles.text}>
        {caseStatus === TaskStatus.Completed ? 'Case Submitted - Read Only' : 'Case Saved - Read Only'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 8,
    borderRadius: 8,
    gap: 8,
    marginVertical: 8,
  },
  text: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '500',
  }
});

export default ReadOnlyIndicator;
