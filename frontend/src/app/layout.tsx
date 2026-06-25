import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@/styles/globals.css";
import { Providers } from "@/lib/providers";
import { ShellLayout } from "@/components/layout/ShellLayout";

export const metadata: Metadata = {
  title: "Stock Discovery & Intelligence",
  description: "AI-powered market intelligence. Educational use only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Providers>
          <ShellLayout>{children}</ShellLayout>
        </Providers>
      </body>
    </html>
  );
}
