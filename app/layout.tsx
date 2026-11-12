import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaManager } from "./pwa-manager";

export const metadata: Metadata = {
  title: "THE PBRU HERITAGE POS",
  description: "ระบบ POS กลางสำหรับห้องอาหารโรงแรมมหาวิทยาลัย",
  applicationName: "PBRU POS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PBRU POS",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/pbru-pos-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: "/icons/pbru-pos-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#006b57",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">
        {children}
        <PwaManager />
      </body>
    </html>
  );
}
