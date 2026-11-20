import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WarehouseThemeSync } from "@/app/components/WarehouseThemeSync";
import { BOSTANLI_WAREHOUSE_ID, SELECTED_WAREHOUSE_STORAGE_KEY } from "@/app/lib/franchiseWarehouses";
import { WAREHOUSE_THEME_ATTRIBUTE } from "@/app/lib/warehouseTheme";

/** İlk boyamadan önce kayıtlı depoya göre temayı verir (Bostanlı açılışında mor bir an görünmesin) */
const THEME_BOOT_SCRIPT = `try{var v=localStorage.getItem(${JSON.stringify(
  SELECTED_WAREHOUSE_STORAGE_KEY
)});document.documentElement.setAttribute(${JSON.stringify(
  WAREHOUSE_THEME_ATTRIBUTE
)},v===${JSON.stringify(BOSTANLI_WAREHOUSE_ID)}?"bostanli":"sogukkuyu")}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stok Takip Paneli",
  description: "Eksik ve fazla ürün takip paneli",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" data-warehouse="sogukkuyu" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <WarehouseThemeSync />
        <div className="min-h-screen w-full">
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
