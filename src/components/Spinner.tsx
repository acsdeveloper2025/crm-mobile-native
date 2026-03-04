import React from 'react';
import { ActivityIndicator } from 'react-native';

interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'large', color = '#ffffff' }) => (
  <ActivityIndicator size={size} color={color} />
);

export default Spinner;
