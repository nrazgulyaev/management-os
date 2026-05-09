import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/pricing-page";
import { MANAGEMENT_OS_PRICING } from "@/lib/billing/pricing";

export const metadata: Metadata = {
  title: "Management OS pricing · Arconique",
  description:
    "Management OS plans: Starter $99/mo for up to 3 villas, Professional $299/mo for up to 15, Enterprise for 16+. 14-day free trial — no credit card.",
};

export default function ManagementOsPricingPage() {
  return <PricingPage pricing={MANAGEMENT_OS_PRICING} />;
}
