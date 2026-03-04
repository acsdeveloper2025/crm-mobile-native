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
    primary: '#2563EB', // blue-600
    primaryLight: '#3B82F6', // blue-500
    primaryDark: '#1D4ED8', // blue-700
    
    background: '#F3F4F6', // gray-100
    surface: '#FFFFFF', // white
    surfaceAlt: '#F9FAFB', // gray-50
    
    text: '#111827', // gray-900
    textSecondary: '#4B5563', // gray-600
    textMuted: '#9CA3AF', // gray-400
    
    success: '#10B981', // emerald-500
    warning: '#F59E0B', // amber-500
    danger: '#EF4444', // red-500
    info: '#3B82F6', // blue-500
    
    border: '#E5E7EB', // gray-200
    borderLight: '#F3F4F6', // gray-100
  },
};

export const darkTheme: Theme = {
  ...commonTokens,
  colors: {
    primary: '#3B82F6', // blue-500 (lighter for dark mode contrast)
    primaryLight: '#60A5FA', // blue-400
    primaryDark: '#2563EB', // blue-600
    
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
    
    border: '#374151', // gray-700
    borderLight: '#1F2937', // gray-800
  },
};
