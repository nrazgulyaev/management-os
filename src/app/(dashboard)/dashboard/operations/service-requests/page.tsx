import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ServiceRequestStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listServiceRequests } from "@/features/operations/services";

export const metadata = { title: "Operations · Service requests" };
export const dynamic = "force-dynamic";

export default async function ServiceRequestsPage() {
  const requests = await listServiceRequests({ limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Service requests" },
        ]}
        title="Service requests"
        description="Guest- and concierge-initiated requests routed through operations."
      />
      <DbStatusNotice />
      <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
        {requests.length === 0 ? (
          <p className="p-6 text-sm text-ink-tertiary">No service requests yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {requests.map((r) => (
              <li key={r.id} className="p-5">
                <Link
                  href={`/dashboard/operations/service-requests/${r.id}`}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-ink-tertiary">
                        {r.requestCode}
                      </span>
                      <PriorityPill priority={r.priority} />
                      <span className="text-[11px] text-ink-tertiary capitalize">
                        {r.requestType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-sm text-ink font-medium mt-1">{r.title}</div>
                    <div className="text-xs text-ink-tertiary mt-0.5">
                      {r.villaCode ?? "—"} · {r.createdAt.slice(0, 10)}
                    </div>
                  </div>
                  <ServiceRequestStatusPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
