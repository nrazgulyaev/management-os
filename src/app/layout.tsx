import type { Metadata, Viewport } from "next";
import {
  Newsreader,
  Inter,
  JetBrains_Mono,
  Space_Grotesk,
  IBM_Plex_Mono,
  Fraunces,
} from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { MotionLayer } from "@/components/motion-layer";
import "./globals.css";

/**
 * Sprint _handoff/ Task 1 — typeface system.
 *
 * The three product palettes ship with three matching display
 * typefaces (handoff INTEGRATION.md §1.1):
 *
 *  - Management OS  → Newsreader (warm humanist serif, with italic)
 *  - Development OS → Space Grotesk (technical sans for display)
 *  - Subscription   → Fraunces (variable-axis editorial serif)
 *
 * Body text on every product is Inter; monospace splits between
 * JetBrains Mono (Mgmt + Subscription) and IBM Plex Mono (Dev).
 *
 * The legacy CSS variable names `--font-display` / `--font-sans` /
 * `--font-mono` are preserved — the existing primitives reference them
 * and would otherwise lose their typography in one shot. `--font-display`
 * now points at Newsreader (was Instrument_Serif), `--font-sans` at
 * Inter (was Geist), `--font-mono` at JetBrains Mono (was Geist_Mono).
 *
 * The three product-specific axes (`--font-newsreader`, `--font-space`,
 * `--font-fraunces`, `--font-plex`, `--font-inter`) are also exposed so
 * port-from-prototype JSX from `_handoff/*.html` can address them
 * directly via inline styles.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
  weight: ["400", "500"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500"],
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
    { media: "(prefers-color-scheme: light)", color: "#F4EFE6" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0E0D" },
  ],
};

/** Map the middleware-stamped `x-product` to the data-product attribute
 *  the new product-scoped palette uses. We only honour the three product
 *  surfaces — `platform` and tenant-scoped traffic fall through to no
 *  attribute (and inherit Management defaults). */
async function resolveDataProduct(): Promise<string | null> {
  try {
    const h = await headers();
    const product = h.get("x-product");
    if (
      product === "management" ||
      product === "development" ||
      product === "subscription"
    ) {
      return product;
    }
  } catch {
    // headers() unavailable (static generation, etc) — fall through.
  }
  return null;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const dataProduct = await resolveDataProduct();
  const fontVars = [
    newsreader.variable,
    inter.variable,
    jetbrainsMono.variable,
    space.variable,
    plex.variable,
    fraunces.variable,
  ].join(" ");
  // Legacy `--font-display` / `--font-sans` / `--font-mono` are aliased
  // to the new typeface variables in globals.css :root so existing
  // primitives keep rendering with the swapped typefaces.
  return (
    <html
      lang="en"
      className={fontVars}
      data-product={dataProduct ?? undefined}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {children}
        <MotionLayer />
        <Analytics />
      </body>
    </html>
  );
}
