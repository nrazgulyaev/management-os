import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/pricing-page";
import { DEVELOPMENT_OS_PRICING } from "@/lib/billing/pricing";

export const metadata: Metadata = {
  title: "Development OS pricing · Arconique",
  description:
    "Development OS plans: Starter $199/mo for one project, Professional $499/mo for up to 5, Enterprise for 6+. 14-day free trial — no credit card.",
};

export default function DevelopmentOsPricingPage() {
  return <PricingPage pricing={DEVELOPMENT_OS_PRICING} />;
}
