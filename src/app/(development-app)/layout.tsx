import { DevelopmentAppShell } from "@/components/development/development-app-shell";
import { ServiceWorkerRegister } from "@/components/development/pwa/service-worker-register";

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
