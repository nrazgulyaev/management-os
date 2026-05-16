import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Arconique OS redesign — display / sans / mono per
// design_handoff_arconique_os/DESIGN_TOKENS.md. CSS variable names
// stay identical (--font-display / --font-sans / --font-mono) so
// every existing `text-display`, `font-sans`, `font-mono` reference
// keeps working — only the underlying typeface changes.
const display = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Arconique Management OS",
    template: "%s · Arconique Management OS",
  },
  description:
    "An investor-grade operating system for premium Bali villa portfolios. Transparent owner statements, operations, and AI-assisted hospitality.",
  metadataBase: new URL("https://management.arconique.com"),
  openGraph: {
    title: "Arconique Management OS",
    description:
      "Investor-grade villa management for premium Bali portfolios — transparent statements, calm operations, permission-aware AI.",
    url: "https://management.arconique.com",
    siteName: "Arconique Management OS",
    locale: "en_US",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Arconique",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F5F0" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0E0D" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
