"use client";

import { createTheme } from '@mui/material/styles';
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap" });

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#2563eb', dark: '#1d4ed8', light: '#60a5fa' },
        secondary: { main: '#475569', dark: '#334155', light: '#94a3b8' },
        background: { default: '#f8fafc', paper: '#ffffff' },
        text: { primary: '#0f172a', secondary: '#64748b' },
        divider: 'rgba(226, 232, 240, 0.5)',
      }
    },
    dark: {
      palette: {
        primary: { main: '#38bdf8', dark: '#0284c7', light: '#7dd3fc' },
        secondary: { main: '#94a3b8', dark: '#64748b', light: '#cbd5e1' },
        background: { default: '#020617', paper: '#0f172a' },
        text: { primary: '#f8fafc', secondary: '#94a3b8' },
        divider: 'rgba(51, 65, 85, 0.3)',
      }
    }
  },
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
      fontFamily: jetbrainsMono.style.fontFamily,
      fontVariantNumeric: "tabular-nums"
    },
    h3: {
      fontSize: "1.125rem",
      fontWeight: 600,
      fontFamily: jetbrainsMono.style.fontFamily,
      fontVariantNumeric: "tabular-nums"
    },
    overline: {
      letterSpacing: "0.05em",
      fontWeight: 600,
    }
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
        root: ({ theme }) => ({
          boxShadow: 'none',
          borderRadius: 12,
          border: `1px solid ${theme.vars.palette.divider}`,
          backgroundImage: 'none'
        })
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
