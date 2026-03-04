import React from 'react';

interface SecurityWrapperProps {
  children: React.ReactNode;
}

export const SecurityWrapper: React.FC<SecurityWrapperProps> = ({ children }) => <>{children}</>;

export default SecurityWrapper;
