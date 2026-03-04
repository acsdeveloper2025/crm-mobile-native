import React from 'react';

interface UpdateModalProps {
  updateInfo: any;
  onUpdate: () => void;
  onDismiss: () => void;
  onLater: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = () => null;

interface UpdateManagerProps {
  children: React.ReactNode;
}

export const UpdateManager: React.FC<UpdateManagerProps> = ({ children }) => <>{children}</>;

export default UpdateManager;
