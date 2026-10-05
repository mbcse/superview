import type { Metadata, Viewport } from "next";
import { prefetchDNS, preconnect } from "react-dom";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "../components/providers";
import "./globals.css";

const saans = localFont({
  src: "../fonts/SaansUprightsVF.woff2",
  variable: "--font-saans",
  display: "swap",
  weight: "300 800",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: "Arial"
});

export const metadata: Metadata = {
  title: "SuperView",
  description: "Write a view. An agent finds the companies, invests, and rebalances.",
  icons: {
    icon: "/superview-logo.png",
    apple: "/superview-logo.png"
  },
  openGraph: {
    title: "SuperView",
    description: "Invest in what you believe.",
    images: [{ url: "/superview-logo.png", width: 1024, height: 1024, alt: "SuperView" }]
  }
};

export const viewport: Viewport = { themeColor: "#F7FAFB" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  prefetchDNS("https://us.i.posthog.com");
  preconnect("https://us.i.posthog.com");
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${saans.variable}`}>
      <body className="font-sans">
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
