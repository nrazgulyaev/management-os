import type { Metadata } from "next";
import { DevelopmentAppShell } from "@/components/development/development-app-shell";
import { ServiceWorkerRegister } from "@/components/development/pwa/service-worker-register";

export const metadata: Metadata = {
  title: {
    default: "Arconique Development OS",
    template: "%s · Arconique Development OS",
  },
};

export default function DevelopmentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ServiceWorkerRegister />
      <DevelopmentAppShell>{children}</DevelopmentAppShell>
    </>
  );
}
