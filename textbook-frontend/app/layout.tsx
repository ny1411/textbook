import type { Metadata } from "next";
import localFont from "next/font/local";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Textbook — AI Research Assistant",
  description: "AI-powered research assistant with Agentic Reasoning & Reflection",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="h-full flex flex-col overflow-hidden font-sans">
        <ReactLenis root>
          {children}
        </ReactLenis>
      </body>
    </html>
  );
}