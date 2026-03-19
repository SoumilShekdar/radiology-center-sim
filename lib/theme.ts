"use client";

import { createTheme } from '@mui/material/styles';
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const theme = createTheme({
  cssVariables: true,
  typography: {
    fontFamily: inter.style.fontFamily,
    h1: {
      fontSize: "3.5rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.1,
    },
    h2: {
      fontSize: "1.5rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontSize: "1.125rem",
      fontWeight: 600,
    },
    overline: {
      letterSpacing: "0.05em",
      fontWeight: 600,
    }
  },
  palette: {
    primary: {
      main: '#2563eb', // Indigo / Blue
      dark: '#1d4ed8',
      light: '#60a5fa',
    },
    secondary: {
      main: '#475569', // Slate
      dark: '#334155',
      light: '#94a3b8',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#64748b',
    },
    divider: '#e2e8f0',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          }
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none'
        }
      }
    }
  }
});
