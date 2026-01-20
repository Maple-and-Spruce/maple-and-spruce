'use client';

import { createTheme, alpha } from '@mui/material/styles';

// =============================================================================
// Design Tokens
// =============================================================================

/**
 * Brand colors - core palette
 */
export const brandColors = {
  cream: '#D5D6C8',
  darkBrown: '#4A3728',
  sageGreen: '#6B7B5E',
  warmGray: '#7A7A6E',
} as const;

/**
 * Extended color palette with tints and shades
 */
export const colors = {
  ...brandColors,
  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  // Sage green variants
  sageGreenLight: '#8A9A7D',
  sageGreenDark: '#4D5A43',
  // Brown variants
  brownLight: '#6B5344',
  brownDark: '#2E2219',
  // Cream variants
  creamLight: '#E8E9DF',
  creamDark: '#C2C3B5',
} as const;

/**
 * Semantic design tokens for surfaces
 * Use these instead of raw colors for consistency
 */
export const surfaces = {
  /** Main page background */
  background: colors.cream,
  /** Cards, tables, dialogs - elevated surfaces */
  paper: colors.white,
  /** Subtle surface variation */
  paperMuted: colors.creamLight,
  /** Header/nav background */
  header: colors.sageGreen,
  /** Table/list column headers - distinct from page background */
  tableHeader: '#C8D4C2',
  /** Input fields background */
  input: colors.white,
  /** Hover state for interactive surfaces */
  hover: alpha(colors.black, 0.04),
  /** Selected/active state */
  selected: alpha(colors.sageGreen, 0.12),
} as const;

/**
 * Semantic tokens for borders/edges
 */
export const borders = {
  /** Default border color */
  default: alpha(colors.black, 0.12),
  /** Subtle border for low emphasis */
  subtle: alpha(colors.black, 0.08),
  /** Strong border for high emphasis */
  strong: alpha(colors.black, 0.23),
  /** Focused input border */
  focus: colors.sageGreen,
} as const;

/**
 * Semantic tokens for text
 */
export const text = {
  /** Primary text - headings, important content */
  primary: colors.darkBrown,
  /** Secondary text - descriptions, less important */
  secondary: colors.warmGray,
  /** Disabled text */
  disabled: alpha(colors.black, 0.38),
  /** Text on primary color backgrounds */
  onPrimary: colors.cream,
  /** Text on dark backgrounds */
  onDark: colors.white,
} as const;

/**
 * Spacing scale (in pixels)
 * Based on 4px base unit
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Border radius scale
 */
export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/**
 * Shadow definitions
 */
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
} as const;

// =============================================================================
// MUI Theme
// =============================================================================

/**
 * MUI theme for Maple & Spruce
 * Uses design tokens defined above for consistency
 */
export const theme = createTheme({
  palette: {
    primary: {
      main: colors.darkBrown,
      light: colors.brownLight,
      dark: colors.brownDark,
      contrastText: colors.white,
    },
    secondary: {
      main: colors.sageGreen,
      light: colors.sageGreenLight,
      dark: colors.sageGreenDark,
      contrastText: text.onPrimary,
    },
    background: {
      default: surfaces.background,
      paper: surfaces.paper,
    },
    text: {
      primary: text.primary,
      secondary: text.secondary,
      disabled: text.disabled,
    },
    divider: borders.default,
    action: {
      hover: surfaces.hover,
      selected: surfaces.selected,
    },
  },
  shape: {
    borderRadius: radii.md,
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    h1: { color: text.primary, fontWeight: 600 },
    h2: { color: text.primary, fontWeight: 600 },
    h3: { color: text.primary, fontWeight: 600 },
    h4: { color: text.primary, fontWeight: 600 },
    h5: { color: text.primary, fontWeight: 600 },
    h6: { color: text.primary, fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: radii.md,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: radii.lg,
          boxShadow: shadows.sm,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Remove default gradient
        },
        elevation1: {
          boxShadow: shadows.sm,
        },
        elevation2: {
          boxShadow: shadows.md,
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: surfaces.paper,
          borderRadius: radii.lg,
          border: `1px solid ${borders.subtle}`,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: surfaces.tableHeader,
          '& .MuiTableCell-head': {
            fontWeight: 600,
            color: text.primary,
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': {
            borderBottom: 0,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: borders.subtle,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: radii.lg,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: radii.md,
            backgroundColor: surfaces.input,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: surfaces.input,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: surfaces.input,
        },
      },
    },
  },
});

// =============================================================================
// CSS Custom Properties (for non-MUI usage)
// =============================================================================

/**
 * Generates CSS custom properties from design tokens
 * Use in global CSS or inject via style tag
 */
export const cssVariables = `
  :root {
    /* Brand Colors */
    --color-cream: ${colors.cream};
    --color-dark-brown: ${colors.darkBrown};
    --color-sage-green: ${colors.sageGreen};
    --color-warm-gray: ${colors.warmGray};

    /* Surfaces */
    --surface-background: ${surfaces.background};
    --surface-paper: ${surfaces.paper};
    --surface-paper-muted: ${surfaces.paperMuted};
    --surface-header: ${surfaces.header};

    /* Borders */
    --border-default: ${borders.default};
    --border-subtle: ${borders.subtle};
    --border-strong: ${borders.strong};
    --border-focus: ${borders.focus};

    /* Text */
    --text-primary: ${text.primary};
    --text-secondary: ${text.secondary};
    --text-on-primary: ${text.onPrimary};

    /* Spacing */
    --spacing-xs: ${spacing.xs}px;
    --spacing-sm: ${spacing.sm}px;
    --spacing-md: ${spacing.md}px;
    --spacing-lg: ${spacing.lg}px;
    --spacing-xl: ${spacing.xl}px;

    /* Radii */
    --radius-sm: ${radii.sm}px;
    --radius-md: ${radii.md}px;
    --radius-lg: ${radii.lg}px;

    /* Shadows */
    --shadow-sm: ${shadows.sm};
    --shadow-md: ${shadows.md};
    --shadow-lg: ${shadows.lg};
  }
`;
