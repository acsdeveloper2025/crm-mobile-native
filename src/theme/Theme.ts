export type ThemeColors = {
  // Brand
  primary: string;
  primaryLight: string;
  primaryDark: string;

  // Background
  background: string;
  surface: string;
  surfaceAlt: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Status
  success: string;
  warning: string;
  danger: string;
  info: string;
  assigned: string;
  inProgress: string;
  completed: string;
  saved: string;
  revoked: string;

  // Borders
  border: string;
  borderLight: string;
};

export type Theme = {
  colors: ThemeColors;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  typography: {
    sizes: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    weights: {
      regular: '400';
      medium: '500';
      semibold: '600';
      bold: '700';
    };
  };
  roundness: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
};

const commonTokens = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      xxl: 32,
    },
    weights: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },
  roundness: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
};

export const lightTheme: Theme = {
  ...commonTokens,
  colors: {
    primary: '#00A950',
    primaryLight: '#00C75F',
    primaryDark: '#008A42',
    
    background: '#FFFFFF',
    surface: '#F9FAFB',
    surfaceAlt: '#F3F4F6',
    
    text: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    
    success: '#10B981', // emerald-500
    warning: '#F59E0B', // amber-500
    danger: '#EF4444', // red-500
    info: '#3B82F6',
    assigned: '#3B82F6',
    inProgress: '#F59E0B',
    completed: '#10B981',
    saved: '#EF4444',
    revoked: '#EF4444',
    
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
  },
};

export const darkTheme: Theme = {
  ...commonTokens,
  colors: {
    primary: '#00A950',
    primaryLight: '#00C75F',
    primaryDark: '#008A42',
    
    background: '#111827', // gray-900
    surface: '#1F2937', // gray-800
    surfaceAlt: '#374151', // gray-700
    
    text: '#F9FAFB', // gray-50
    textSecondary: '#D1D5DB', // gray-300
    textMuted: '#6B7280', // gray-500
    
    success: '#34D399', // emerald-400
    warning: '#FBBF24', // amber-400
    danger: '#F87171', // red-400
    info: '#60A5FA', // blue-400
    assigned: '#60A5FA',
    inProgress: '#FBBF24',
    completed: '#34D399',
    saved: '#F87171',
    revoked: '#F87171',
    
    border: '#374151', // gray-700
    borderLight: '#1F2937', // gray-800
  },
};
