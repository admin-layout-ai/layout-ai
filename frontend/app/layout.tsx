// frontend/app/layout.tsx
// Root layout with ErrorBoundary and improved SEO metadata

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Improved metadata for SEO
export const metadata: Metadata = {
  metadataBase: new URL('https://layout-ai.com.au'),
  title: {
    default: "Layout AI - AI-Powered Floor Plan Generation",
    template: "%s | Layout AI",
  },
  description: "Generate council-submissible floor plans for Australian builders using AI. NCC compliant designs ready for council approval in minutes.",
  keywords: [
    "floor plans",
    "AI floor plan generator",
    "Australian building",
    "NCC compliant",
    "council approval",
    "home design",
    "builder tools",
    "architecture AI",
  ],
  authors: [{ name: "Layout AI", url: "https://layout-ai.com.au" }],
  creator: "Layout AI",
  publisher: "Layout AI",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: "https://layout-ai.com.au",
    siteName: "Layout AI",
    title: "Layout AI - AI-Powered Floor Plan Generation",
    description: "Generate council-submissible floor plans for Australian builders using AI. NCC compliant designs in minutes.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Layout AI - AI Floor Plan Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Layout AI - AI-Powered Floor Plan Generation",
    description: "Generate council-submissible floor plans for Australian builders using AI.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <ErrorBoundary>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
