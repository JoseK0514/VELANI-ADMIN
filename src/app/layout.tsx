import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./admin.css";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Velani admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f2f6f5" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
