import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DeployResilience } from "@/components/DeployResilience";
import { TelegramInit } from "@/components/TelegramInit";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const iconVersion = "20260923";

export const metadata: Metadata = {
  title: "FinOS",
  description:
    "FinOS помогает вести семейные и личные финансы, быстрые записи и безопасный дневной лимит.",
  manifest: `/manifest.webmanifest?v=${iconVersion}`,
  appleWebApp: {
    capable: true,
    title: "FinOS",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: `/favicon.ico?v=${iconVersion}`, sizes: "any" },
      { url: `/favicon-16x16.png?v=${iconVersion}`, sizes: "16x16", type: "image/png" },
      { url: `/favicon-32x32.png?v=${iconVersion}`, sizes: "32x32", type: "image/png" },
      { url: `/icons/icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png" },
      { url: `/icons/icon-512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: `/favicon.ico?v=${iconVersion}` }],
    apple: [
      { url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f1ea",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <ToastProvider>
          <ErrorBoundary>
            <DeployResilience />
            <TelegramInit />
            {children}
          </ErrorBoundary>
        </ToastProvider>
      </body>
    </html>
  );
}
