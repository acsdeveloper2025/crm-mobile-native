import React, { useEffect } from 'react';
import { View } from 'react-native';
import AutoSaveIndicator from './AutoSaveIndicator';

interface AutoSaveFormWrapperProps {
  taskId: string;
  formType: string;
  formData: any;
  images?: any[];
  children: React.ReactNode;
  onDataRestored?: (data: any) => void;
  onFormDataChange?: (formData: any) => void;
  onImagesChange?: (images: any[]) => void;
  autoSaveOptions?: {
    debounceMs?: number;
    enableAutoSave?: boolean;
    showIndicator?: boolean;
  };
}

const AutoSaveFormWrapper: React.FC<AutoSaveFormWrapperProps> = ({
  children,
  onDataRestored,
  autoSaveOptions,
}) => {
  useEffect(() => {
    if (onDataRestored) {
      onDataRestored(null);
    }
  }, [onDataRestored]);

  return (
    <View>
      {autoSaveOptions?.showIndicator !== false ? (
        <AutoSaveIndicator status={{}} showDetails={false} />
      ) : null}
      <View>{children}</View>
    </View>
  );
};

export default AutoSaveFormWrapper;

export const useAutoSaveFormWrapper = () => ({
  markCompleted: async () => {},
  hasUnsavedChanges: false,
  isAutoSaving: false,
  lastSaved: null as string | null,
});
