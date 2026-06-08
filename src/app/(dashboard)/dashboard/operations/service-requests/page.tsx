import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ServiceRequestStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listServiceRequests } from "@/features/operations/services";
import { listVillas } from "@/features/villas/services";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { ServiceRequestAddButton } from "@/components/operations/service-request-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Service requests" };
export const dynamic = "force-dynamic";

export default async function ServiceRequestsPage() {
  const [requests, villas] = await Promise.all([
    listServiceRequests({ limit: 200 }),
    listVillas(),
  ]);
  const villaOpts = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName}`,
  }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Service requests" },
        ]}
        title="Service requests"
        description="Guest- and concierge-initiated requests routed through operations."
        actions={<ServiceRequestAddButton villas={villaOpts} />}
      />
      <DbStatusNotice />
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
        {requests.length === 0 ? (
          <NoItemsYet
            entityLabel="service requests"
            description="Guest service requests will appear here as the concierge AI hands off and as guests submit through the in-stay app."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {requests.map((r) => (
              <li
                key={r.id}
                className="p-5 flex items-center justify-between gap-4"
              >
                <Link
                  href={`/dashboard/operations/service-requests/${r.id}`}
                  className="flex-1 min-w-0 flex items-center justify-between gap-4"
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
                    <div className="text-sm text-ink font-medium mt-1">
                      {r.title}
                    </div>
                    <div className="text-xs text-ink-tertiary mt-0.5">
                      {r.villaCode ?? "—"} · {r.createdAt.slice(0, 10)}
                    </div>
                  </div>
                  <ServiceRequestStatusPill status={r.status} />
                </Link>
                <OperationsRowActions
                  kind="service_request"
                  row={{
                    id: r.id,
                    displayName: r.title,
                    detailHref: `/dashboard/operations/service-requests/${r.id}`,
                    values: {
                      title: r.title,
                      message: r.message ?? "",
                      requestType: r.requestType,
                      priority: r.priority,
                      villaId: r.villaId ?? "",
                      bookingId: r.bookingId ?? "",
                      guestId: r.guestId ?? "",
                      preferredTime: r.preferredTime ?? "",
                    },
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
