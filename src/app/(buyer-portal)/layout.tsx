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
 */
export default function BuyerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-ink antialiased">
      {children}
    </div>
  );
}
