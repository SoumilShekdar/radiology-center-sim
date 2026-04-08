"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "@/lib/theme";

export function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline />
        {children}
      </ThemeProvider>
    </NextThemeProvider>
  );
}
