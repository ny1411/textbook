import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ReactLenis } from "lenis/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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