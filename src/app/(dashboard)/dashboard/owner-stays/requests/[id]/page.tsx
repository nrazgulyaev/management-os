import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getOwnerStayRequestById } from "@/features/owner-stays/services";
import { listRelocationCandidates } from "@/features/owner-stays/relocation";
import { OwnerStayDecisionBar } from "@/components/owner-stays/decision-bar";
import { OwnerStayLifecycleBar } from "@/components/owner-stays/lifecycle-bar";
import { RelocationCandidateRow } from "@/components/owner-stays/relocation-candidate-row";

export const metadata = { title: "Owner stay request" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  requested: "info",
  availability_check: "info",
  requires_relocation: "warning",
  pending_admin_approval: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  completed: "neutral",
};

const FINANCE_STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  pending: "info",
  bridged: "success",
  skipped_no_charge: "neutral",
  skipped_locked_period: "warning",
  failed: "danger",
  reversed: "neutral",
  not_applicable: "neutral",
};

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function OwnerStayRequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [request, candidates] = await Promise.all([
    getOwnerStayRequestById(id),
    listRelocationCandidates(id),
  ]);
  if (!request) notFound();

  // Build a status timeline from the columns we already track. Pure
  // chronological list — we don't query the audit log here to keep the
  // page lightweight.
  const timeline = buildTimeline(request);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Requests", href: "/dashboard/owner-stays/requests" },
          { label: id.slice(0, 8) },
        ]}
        title={`Owner stay — ${request.villaCode ?? "villa"}`}
        description={`${request.ownerName ?? "owner"} · ${request.requestedStart} → ${request.requestedEnd}`}
        actions={<OwnerStayDecisionBar id={request.id} status={request.status} />}
      />

      <Section eyebrow="Status" title="Request">
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <Badge tone={STATUS_TONES[request.status] ?? "neutral"}>
              {request.status.replace(/_/g, " ")}
            </Badge>
          </Field>
          <Field label="Total nights" value={String(request.allowanceNightsApplied + request.billableNights)} />
          <Field label="Allowance nights" value={String(request.allowanceNightsApplied)} />
          <Field label="Billable nights" value={String(request.billableNights)} />
          <Field
            label="Estimated gross"
            value={formatMoney(request.estimatedGrossRevenueMinor, request.currency)}
          />
          <Field
            label="Management compensation"
            value={formatMoney(
              request.estimatedManagementCompensationMinor,
              request.currency,
            )}
          />
          <Field
            label="Operational cost"
            value={formatMoney(
              request.estimatedOperationalCostMinor,
              request.currency,
            )}
          />
          <Field
            label="Total owner charge"
            value={formatMoney(
              request.estimatedTotalOwnerChargeMinor,
              request.currency,
            )}
          />
          {request.purpose && (
            <div className="md:col-span-4">
              <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                Purpose
              </div>
              <p className="text-sm text-ink-secondary mt-1">{request.purpose}</p>
            </div>
          )}
          {request.adminNotes && (
            <div className="md:col-span-4">
              <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                Admin notes
              </div>
              <p className="text-sm text-ink-secondary mt-1">{request.adminNotes}</p>
            </div>
          )}
        </div>
      </Section>

      <Section
        eyebrow="Lifecycle"
        title="Complete + finance bridge"
        description="Mark the stay completed once the owner has checked out, then bridge it into finance. The bridge is idempotent — re-running never duplicates rows."
      >
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="Completed at">
            {request.completedAt ? (
              <span className="text-ink-secondary tabular-nums">
                {request.completedAt.slice(0, 16).replace("T", " ")}
              </span>
            ) : (
              <span className="text-ink-tertiary">not yet</span>
            )}
          </Field>
          <Field label="Finance bridge">
            <Badge tone={FINANCE_STATUS_TONES[request.financeBridgeStatus] ?? "neutral"}>
              {request.financeBridgeStatus.replace(/_/g, " ")}
            </Badge>
          </Field>
          <div className="md:col-start-3 md:row-start-1 md:row-span-2 flex items-start justify-end">
            <OwnerStayLifecycleBar
              id={request.id}
              status={request.status}
              financeBridgeStatus={request.financeBridgeStatus}
            />
          </div>
        </div>
      </Section>

      <Section eyebrow="Timeline" title={`${timeline.length} events`}>
        {timeline.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No transitions recorded yet.</p>
        ) : (
          <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {timeline.map((e, i) => (
              <li key={i} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-ink font-medium">{e.label}</div>
                  {e.detail && (
                    <div className="text-xs text-ink-tertiary mt-1">{e.detail}</div>
                  )}
                </div>
                <div className="text-[11px] text-ink-tertiary tabular-nums shrink-0">
                  {e.at.slice(0, 16).replace("T", " ")}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        eyebrow="Relocation"
        title={`${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        description={
          request.relocationRequired
            ? "Approving the owner stay requires relocating overlapping guest bookings. Approve and apply candidates, then approve the owner stay."
            : "No relocation needed for this request."
        }
      >
        {candidates.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No candidates discovered yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {candidates.map((c) => (
                <RelocationCandidateRow key={c.id} candidate={c} />
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

interface TimelineEntry {
  label: string;
  detail?: string;
  at: string;
}

function buildTimeline(
  r: NonNullable<Awaited<ReturnType<typeof getOwnerStayRequestById>>>,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  out.push({ label: "Request submitted", at: r.createdAt });
  if (r.approvedAt) out.push({ label: "Approved by admin", at: r.approvedAt });
  if (r.rejectedAt) out.push({ label: "Rejected by admin", at: r.rejectedAt });
  if (r.completedAt) out.push({ label: "Stay completed", at: r.completedAt });
  if (r.financeBridgeStatus !== "pending") {
    out.push({
      label: "Finance bridge",
      detail: r.financeBridgeStatus.replace(/_/g, " "),
      at: r.createdAt, // we don't store a separate bridge timestamp on the request row
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
