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
  return (
    <div className="min-h-screen bg-[#F8F5F0] text-ink antialiased">
      {children}
    </div>
  );
}
