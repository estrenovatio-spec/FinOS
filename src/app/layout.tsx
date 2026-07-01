import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DeployResilience } from "@/components/DeployResilience";
import { TelegramInit } from "@/components/TelegramInit";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Просто Бюджет: учёт финансов",
  description: "Семейный и бизнес-учёт финансов с Telegram, голосовым вводом и финансовым советником.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Просто Бюджет",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
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
