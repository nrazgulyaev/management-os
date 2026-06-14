import { notFound } from "next/navigation";
import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { ServiceRequestStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { ServiceRequestActions } from "@/components/operations/service-request-actions";
import { listServiceRequests } from "@/features/operations/services";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service request" };

export default async function ServiceRequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // listServiceRequests has the joined villa info and uses the same filter
  // path; cheaper than adding a one-shot service for now.
  const all = await listServiceRequests({ limit: 1000 });
  const sr = all.find((r) => r.id === id);
  if (!sr) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <Link href="/dashboard/operations/service-requests">
              Service requests
            </Link>{" "}
            / <span>{sr.requestCode}</span>
          </div>
          <h1>{sr.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {sr.requestType.replace(/_/g, " ")} · {sr.requestCode}
          </p>
        </div>
        <div className="actions">
          <ServiceRequestActions id={sr.id} status={sr.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Status" value={<ServiceRequestStatusPill status={sr.status} />} />
        <Kpi label="Priority" value={<PriorityPill priority={sr.priority} />} />
        <Kpi label="Villa" value={sr.villaCode ?? "—"} />
        <Kpi
          label="Preferred"
          value={sr.preferredTime ? sr.preferredTime.slice(0, 16).replace("T", " ") : "—"}
        />
        <Kpi label="Created" value={sr.createdAt.slice(0, 16).replace("T", " ")} />
      </div>
      {sr.message && (
        <div>
          <div className="label mb-2.5">Message</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
              {sr.message}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
