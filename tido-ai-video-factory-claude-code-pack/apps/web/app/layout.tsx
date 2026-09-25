import type { Metadata } from "next";
import { Be_Vietnam_Pro, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
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
  title: "TIDO — AI Video Factory",
  description: "Hệ thống sản xuất video AI nội bộ của TIDO Production",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${beVietnam.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        {/* Wraps everything so any page can ask who is signed in. The provider
            renders no markup of its own and adds no layout. */}
        <AuthProvider>
          <Sidebar />
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
