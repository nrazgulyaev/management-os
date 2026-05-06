import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listSecurityCameraDevices } from "@/features/security/services";

export const metadata = { title: "Cameras" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  active: "success",
  offline: "warning",
  maintenance: "warning",
  archived: "neutral",
};

export default async function CamerasPage() {
  const cameras = await listSecurityCameraDevices();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Security", href: "/dashboard/security" },
          { label: "Cameras" },
        ]}
        title="Cameras"
        description="Registry only — the platform never streams video. Operators click through to the vendor app for live feeds."
        actions={
          <Link
            href="/dashboard/security/cameras/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + New camera
          </Link>
        }
      />

      <Section eyebrow="Devices" title={`${cameras.length} cameras`}>
        {cameras.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No cameras yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Location</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Provider</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Access role</th>
                  <th className="text-right px-3 py-2">Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {cameras.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-ink font-medium">{c.name}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {c.locationLabel}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {c.villaCode ?? c.projectName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {c.provider ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[c.status] ?? "neutral"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {c.accessRole ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.externalAppUrl ? (
                        <a
                          href={c.externalAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-ink hover:underline underline-offset-4"
                        >
                          Open ↗
                        </a>
                      ) : (
                        <span className="text-ink-tertiary text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
