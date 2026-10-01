import type { Metadata } from "next";
import { Be_Vietnam_Pro, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import VmcAppShell from "@/components/vmc/VmcAppShell";
import { AuthProvider } from "@/features/auth/AuthProvider";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "VMC STUDIO — VIC Marketing Pro Studio",
  description: "Hệ thống sản xuất hình ảnh & video AI thương mại của VMC Studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${beVietnam.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-surface-container-lowest text-text" suppressHydrationWarning>
        <AuthProvider>
          <VmcAppShell>{children}</VmcAppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
