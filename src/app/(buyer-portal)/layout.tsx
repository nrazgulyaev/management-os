import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arconique Buyer Portal",
  description:
    "Curated villa progress + payments view for Arconique villa buyers.",
};

/**
 * Route-group layout for `/buyer-portal/*`. Distinct visual treatment
 * from the internal `/development-os/*` shell and the `/investor-portal/*`
 * — buyers get a warm villa-tone background that's neither operator nor
 * investor.
 *
 * The `data-product="management"` attribute is what makes the handoff
 * design-system CSS resolve: without a `[data-product]` ancestor the
 * Layer-B palette tokens (`--canvas`, `--surface`, `--ink`, …) never get
 * a value, so primitives render unstyled. The buyer portal has no
 * dedicated palette block in tokens.css, so it borrows the warm-cream
 * `management`/`owner` palette — the closest existing match. The
 * background then resolves via the `bg-canvas` token instead of a
 * hardcoded hex.
 */
export default function BuyerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-product="management"
      className="min-h-screen bg-canvas text-ink antialiased"
    >
      {children}
    </div>
  );
}
