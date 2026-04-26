import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Service requests", href: "/dashboard/operations/service-requests" },
          { label: sr.requestCode },
        ]}
        title={sr.title}
        description={`${sr.requestType.replace(/_/g, " ")} · ${sr.requestCode}`}
        actions={<ServiceRequestActions id={sr.id} status={sr.status} />}
      />
      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<ServiceRequestStatusPill status={sr.status} />} />
        <Stat label="Priority" value={<PriorityPill priority={sr.priority} />} />
        <Stat label="Villa" value={sr.villaCode ?? "—"} />
        <Stat
          label="Preferred"
          value={sr.preferredTime ? sr.preferredTime.slice(0, 16).replace("T", " ") : "—"}
        />
        <Stat label="Created" value={sr.createdAt.slice(0, 16).replace("T", " ")} />
      </div>
      {sr.message && (
        <Section eyebrow="Message" title="Guest brief">
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
            {sr.message}
          </p>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
