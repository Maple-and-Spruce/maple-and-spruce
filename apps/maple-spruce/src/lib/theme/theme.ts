'use client';

import { createTheme } from '@mui/material/styles';

/**
 * Maple & Spruce brand colors
 */
export const brandColors = {
  cream: '#D5D6C8',
  darkBrown: '#4A3728',
  sageGreen: '#6B7B5E',
  warmGray: '#7A7A6E',
};

/**
 * MUI theme for Maple & Spruce
 */
export const theme = createTheme({
  palette: {
    primary: {
      main: brandColors.sageGreen,
      contrastText: brandColors.cream,
    },
    secondary: {
      main: brandColors.darkBrown,
      contrastText: brandColors.cream,
    },
    background: {
      default: brandColors.cream,
      paper: '#FFFFFF',
    },
    text: {
      primary: brandColors.darkBrown,
      secondary: brandColors.warmGray,
    },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    h1: {
      color: brandColors.darkBrown,
      fontWeight: 600,
    },
    h2: {
      color: brandColors.darkBrown,
      fontWeight: 600,
    },
    h3: {
      color: brandColors.darkBrown,
      fontWeight: 600,
    },
    h4: {
      color: brandColors.darkBrown,
      fontWeight: 600,
    },
    h5: {
      color: brandColors.darkBrown,
      fontWeight: 600,
    },
    h6: {
      color: brandColors.darkBrown,
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});
