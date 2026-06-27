import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, APP_SHORT } from "@/lib/constants";
import { PWARegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Academy management — attendance, coaching, progress, fees.",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_SHORT,
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
