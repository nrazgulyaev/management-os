import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { listSecurityCameraDevices } from "@/features/security/services";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityHubPage() {
  const cameras = await listSecurityCameraDevices();
  const active = cameras.filter((c) => c.status === "active");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Security" }]}
        title="Security"
        description="Camera registry. The platform never streams video — every camera links out to its vendor app. Owners + guests cannot see this surface."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Cameras" value={String(cameras.length)} />
        <MetricCard label="Active" value={String(active.length)} />
      </div>

      <Section eyebrow="Surfaces" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href="/dashboard/security/cameras"
            className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors block"
          >
            <div className="text-ink font-medium text-base">Cameras</div>
            <div className="text-sm text-ink-secondary mt-1">
              {cameras.length} registered devices
            </div>
          </Link>
        </div>
      </Section>
    </div>
  );
}
