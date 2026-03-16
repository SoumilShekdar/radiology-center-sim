import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Radiology Department Simulator",
  description: "Model radiology capacity, staffing, queues, and revenue over different planning horizons."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
