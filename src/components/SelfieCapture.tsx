import { View, Text, StyleSheet } from 'react-native';
import { CapturedImage } from '../types/index';
import ImageCapture from './ImageCapture';

interface SelfieCaptureProps {
  taskId?: string;
  images: CapturedImage[];
  onImagesChange: (images: CapturedImage[]) => void;
  isReadOnly?: boolean;
  required?: boolean;
  title?: string;
  compact?: boolean;
}

const SelfieCapture: React.FC<SelfieCaptureProps> = ({
  images,
  taskId,
  onImagesChange,
  isReadOnly = false,
  required = true,
  title,
  compact = false
}) => {
  // If compact mode, don't wrap in additional container
  if (compact) {
    return (
      <ImageCapture
        taskId={taskId}
        images={images}
        onImagesChange={onImagesChange}
        isReadOnly={isReadOnly}
        minImages={required ? 1 : 0}
        cameraDirection="front"
        componentType="selfie"
        title={title}
        required={required}
        compact={compact}
      />
    );
  }

  return (
    <View>
      <ImageCapture
        taskId={taskId}
        images={images}
        onImagesChange={onImagesChange}
        isReadOnly={isReadOnly}
        minImages={required ? 1 : 0}
        cameraDirection="front"
        componentType="selfie"
        title={title}
        required={required}
        compact={compact}
      />

      {required && images.length === 0 && (
        <View style={styles.requiredBanner}>
          <Text style={styles.requiredText}>⚠️ Selfie photo is required for verification</Text>
        </View>
      )}

      {images.length > 0 && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>✅ Selfie photo captured successfully</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  requiredBanner: {
    padding: 8,
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    marginTop: 8,
  },
  requiredText: {
    color: '#856404',
  },
  successBanner: {
    padding: 8,
    backgroundColor: '#d4edda',
    borderRadius: 4,
    marginTop: 8,
  },
  successText: {
    color: '#155724',
  },
});

export default SelfieCapture;
