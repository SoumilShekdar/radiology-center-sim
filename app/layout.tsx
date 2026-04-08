import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeRegistry } from "@/components/theme-registry";
import { Toaster } from "sonner";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Radiology Department Simulator",
  description: "Model radiology capacity, staffing, queues, and revenue over different planning horizons."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeRegistry>
            {children}
            <Toaster position="top-right" richColors />
          </ThemeRegistry>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
