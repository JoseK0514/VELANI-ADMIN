import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { AdminApp } from "../ui/app";
import "./admin.css";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Velani admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f2f6f5" };

/**
 * The admin app is mounted here, in the root layout, on purpose. A layout is
 * kept across client navigation, while the catch-all page below it is replaced
 * every time the address changes. The app owns the sign-in gate, the session
 * and the store of commands that have no definitive answer yet (operation ID
 * and exact body), so none of that may live in the page.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        <AdminApp />
        {children}
      </body>
    </html>
  );
}
