import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "ClawTrade | Polymarket AI Bot",
  description: "Revolutionary AI-powered Polymarket trading engine with real-time analytics, intelligent position management, and Claude-powered market analysis.",
  keywords: ["crypto", "trading", "polymarket", "AI", "bot", "bitcoin", "solana"],
  authors: [{ name: "ClawTrade Team" }],
  openGraph: {
    title: "ClawTrade | Polymarket AI Bot",
    description: "Revolutionary AI-powered Polymarket trading engine",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#020617" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
