import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApexPicker } from "./_components/apex-picker";
import { SubscriptionLanding } from "./_components/subscription-landing";
import {
  ProductLanding,
  type ProductLandingKind,
} from "@/components/product-landing/product-landing";

/**
 * Stage 10.I.2 — Umbrella public homepage.
 *
 * Replaces the prior single-product Mgmt-OS landing. Surfaces both
 * products as equal entry points; deep Mgmt-OS marketing moves to
 * /products/management-os in 10.I.3, deep Dev-OS marketing moves to
 * /products/development-os.
 *
 * Brand voice: Professional / investor-grade per 10.I.1 operator
 * decision. Restrained palette, display typeface for headlines only,
 * conversion through clarity not pressure.
 *
 * Sprint 2 update — when the request arrives via a product subdomain
 * (middleware stamps `x-product: management|development|subscription
 * |platform`), this page short-circuits the umbrella marketing and
 * renders a product-specific apex landing instead. `platform` redirects
 * into the platform-admin layout which carries its own super_admin
 * gate.
 */

export const metadata = {
  title: "Arconique OS · One platform for property",
  description:
    "Two operating systems. One platform. Manage every villa and develop every project from a single source of truth — designed for investor-grade trust.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Sprint 2 — per-product subdomain branch.
  const h = await headers();
  const product = h.get("x-product");
  if (product === "platform") {
    // Hand off to the (platform-app) layout: super_admin → /platform,
    // anonymous → /login?next=/platform, others → /no-product-access.
    redirect("/platform");
  }
  // _handoff/ Task 2 — `subscription.arconique.com/` renders the new
  // boutique-software-house landing (was SalesHub in Sprint 3a).
  if (product === "subscription") {
    return <SubscriptionLanding />;
  }
  // Mgmt + Dev subdomains usually get rewritten to /landing/management-os
  // and /landing/development-os by the middleware (Sprint ARCH-1), so
  // this branch only fires if a client requests / directly. Keep the
  // pre-existing ProductLanding as a fallback until Tasks 3+4 port the
  // full prototype landings.
  if (product === "management" || product === "development") {
    return <ProductLanding product={product as ProductLandingKind} />;
  }
  // Apex `arconique.com` (no product subdomain) — render the
  // _handoff/index.html split-screen picker.
  return <ApexPicker />;
}

