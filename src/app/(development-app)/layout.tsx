import type { Metadata } from "next";
import { DevelopmentAppShell } from "@/components/development/development-app-shell";
import { ServiceWorkerRegister } from "@/components/development/pwa/service-worker-register";
import { enforceProductAccess } from "@/features/auth/products-access";

export const metadata: Metadata = {
  title: {
    default: "Arconique Development OS",
    template: "%s · Arconique Development OS",
  },
};

// Stage 10.H — every /development-os/* request passes through the
// product-access guard. Same bypass + redirect rules as the Mgmt OS
// layout (super_admin / demo always pass; org without 'dev' gets
// redirected to its accessible product or /no-product-access).
export default async function DevelopmentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceProductAccess("dev");
  return (
    <>
      <ServiceWorkerRegister />
      <DevelopmentAppShell>{children}</DevelopmentAppShell>
    </>
  );
}
