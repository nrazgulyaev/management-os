import { DashboardShell } from "@/components/layout/dashboard-shell";
import { enforceProductAccess } from "@/features/auth/products-access";

// Stage 10.H — every /dashboard/* request passes through the product-access
// guard. Demo mode + super_admin bypass; signed-in users with no `mgmt` in
// their org's products_enabled get redirected to their other product (or
// /no-product-access if zero). Anonymous visitors pass through to the
// existing sign-in CTA surfaces.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceProductAccess("mgmt");
  return <DashboardShell>{children}</DashboardShell>;
}
