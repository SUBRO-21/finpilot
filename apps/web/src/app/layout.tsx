import "./globals.css";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter", display: "swap" });

export const metadata = { title: "FinOS", description: "Know where your cash is going, and when it might run out." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
