import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "../components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuperView",
  description: "Write a view. An agent finds the companies, invests, and rebalances.",
  openGraph: {
    title: "SuperView",
    description: "Invest in what you believe."
  }
};

export const viewport: Viewport = { themeColor: "#F7FAFB" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
