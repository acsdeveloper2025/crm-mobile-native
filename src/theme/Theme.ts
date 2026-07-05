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
  submitted: string;
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
    // v2 brand — blue (was ACS green). Values mirror crm2 packages/ui-theme
    // tokens.css :root; text/border track the v2 slate ramp, which the web
    // already WCAG-AA tuned (muted darkened for ≥4.5:1). Keep the 3-tier
    // text → secondary → muted hierarchy visible.
    primary: '#2463EB', // blue-600 (--primary)
    primaryLight: '#3B82F6', // blue-500
    primaryDark: '#1D4FD7', // blue-700 (--primary-hover)

    background: '#FFFFFF',
    surface: '#F8FAFC', // slate-50
    surfaceAlt: '#F1F5F9', // slate-100 (--muted)

    text: '#1D283A', // slate-800 (--foreground)
    textSecondary: '#344256', // slate-700 (--secondary-foreground)
    textMuted: '#5C6B7F', // slate-500 darkened (--muted-foreground)

    success: '#1B9D4A', // green-600 (--success)
    warning: '#F59E0B', // amber-500 (--warning)
    danger: '#DC2828', // red-600 (--destructive)
    info: '#0284C5', // sky-600 (--info) — deliberately distinct from primary blue
    assigned: '#2463EB',
    inProgress: '#F59E0B',
    submitted: '#0E7490', // cyan-700 (--st-submitted) — distinct blue-family shade vs assigned (blue) & completed (green)
    completed: '#1B9D4A',
    saved: '#DC2828',
    revoked: '#DC2828',

    border: '#E1E7EF', // slate-200 (--border)
    borderLight: '#F1F5F9', // slate-100
  },
};

export const darkTheme: Theme = {
  ...commonTokens,
  colors: {
    // v2 brand — blue. Values mirror crm2 packages/ui-theme tokens.css .dark
    // (charcoal-222 surfaces, blue-500 primary), status hues from the web --st-* family.
    primary: '#3C83F6', // blue-500 (dark --primary)
    primaryLight: '#61A6FA', // blue-400 (dark --primary-hover)
    primaryDark: '#2463EB', // blue-600

    background: '#11141D', // charcoal (dark --background)
    surface: '#171C26', // dark --card
    surfaceAlt: '#2A2F3C', // dark --secondary / --muted

    text: '#E7EBEF', // dark --foreground
    // slate-300 — deliberately dimmer than the web dark --secondary-foreground
    // (#E7EBEF, which equals `text`) so the 3-tier text→secondary→muted ramp
    // stays visible in dark mode (mirrors the light-mode rationale above).
    textSecondary: '#CBD5E1',
    textMuted: '#95A1B2', // dark --muted-foreground

    success: '#2EB860', // dark --success
    warning: '#F6A823', // dark --warning
    danger: '#D02F2F', // dark --destructive
    info: '#26B2F2', // sky (dark --info) — deliberately distinct from primary blue
    assigned: '#3C83F6',
    inProgress: '#F6A823',
    submitted: '#42DBF0', // cyan (dark --st-submitted) — distinct blue-family shade vs assigned (blue) & completed (green)
    completed: '#2EB860',
    saved: '#D02F2F',
    revoked: '#D02F2F',

    border: '#2F3541', // dark --border
    borderLight: '#232833',
  },
};
