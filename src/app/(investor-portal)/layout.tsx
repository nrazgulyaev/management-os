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
  // data-product="management" activates the design-system token layer
  // (tokens.css [data-product="management"] palette + the component CSS
  // scoped to [data-product]). The investor portal is served on the
  // management host, which never gets the html-level data-product stamp,
  // so this nested scope is what makes --surface / --success / --ink and
  // the cream/stone/ink utilities resolve for every portal page.
  return (
    <div
      data-product="management"
      className="min-h-screen bg-canvas text-ink antialiased"
    >
      {children}
    </div>
  );
}
