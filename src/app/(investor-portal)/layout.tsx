import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arconique Investor Portal",
  description: "Read-only investor capital + distribution dashboard.",
};

/**
 * Route-group layout for `/investor-portal/*`. Distinct visual treatment
 * from the internal `/development-os/*` shell (cream background, no
 * internal sidebar) so investors never see a UI cue that suggests they
 * have internal access.
 */
export default function InvestorPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // data-product="development" activates the Dev OS engineering palette
  // (tokens.css [data-product="development"] block: carbon/amber surfaces,
  // Space Grotesk display, IBM Plex Mono numbers) plus the component CSS
  // scoped to [data-product]. The investor portal is the LP-facing surface
  // of the development product (middleware maps `/investor-portal` under
  // `development`); this nested scope guarantees those tokens resolve even
  // when the portal is reached via impersonation on a non-dev host.
  return (
    <div
      data-product="development"
      data-surface="investor-portal"
      className="min-h-screen bg-canvas text-ink antialiased"
    >
      {children}
    </div>
  );
}
