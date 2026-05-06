import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getOwnerStayRequestById } from "@/features/owner-stays/services";
import { OwnerCancelStayButton } from "@/components/owner-stays/owner-cancel-button";

export const metadata = { title: "Owner stay" };
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

const PUBLIC_STATUS: Record<string, string> = {
  requested: "Submitted — checking availability",
  availability_check: "Checking availability",
  requires_relocation: "Awaiting admin review",
  pending_admin_approval: "Awaiting admin review",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
  completed: "Completed",
};

const CANCELLABLE = new Set([
  "requested",
  "availability_check",
  "requires_relocation",
  "pending_admin_approval",
]);

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function OwnerStayDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // RLS already restricts owners to their own rows; this read is safe.
  const request = await getOwnerStayRequestById(id);
  if (!request) notFound();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner portal", href: "/owner" },
          { label: "Stays", href: "/owner/stays" },
          { label: id.slice(0, 8) },
        ]}
        title={`${request.villaCode ?? "Villa"} · ${request.requestedStart} → ${request.requestedEnd}`}
        description="Your owner stay request — status, allowance, estimated charges."
        actions={
          CANCELLABLE.has(request.status) ? (
            <OwnerCancelStayButton id={request.id} />
          ) : null
        }
      />

      <Section eyebrow="Status" title={PUBLIC_STATUS[request.status] ?? request.status}>
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="Status">
            <Badge tone={STATUS_TONES[request.status] ?? "neutral"}>
              {PUBLIC_STATUS[request.status] ?? request.status}
            </Badge>
          </Field>
          <Field label="Allowance nights" value={String(request.allowanceNightsApplied)} />
          <Field label="Billable nights" value={String(request.billableNights)} />
          <Field
            label="Operational cost"
            value={formatMoney(
              request.estimatedOperationalCostMinor,
              request.currency,
            )}
          />
          <Field
            label="Pool / management compensation"
            value={formatMoney(
              request.estimatedManagementCompensationMinor,
              request.currency,
            )}
          />
          <Field
            label="Estimated total charge"
            value={formatMoney(
              request.estimatedTotalOwnerChargeMinor,
              request.currency,
            )}
          />
        </div>
      </Section>

      {request.relocationRequired && request.status !== "approved" && (
        <Section eyebrow="Heads up" title="Some dates need extra review">
          <p className="rounded-md border border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-secondary">
            Some of your selected dates overlap with existing reservations.
            Our team is reviewing whether the stay can be accommodated. You'll
            be notified as soon as a decision is made.
          </p>
        </Section>
      )}

      {request.status === "approved" && (
        <Section eyebrow="Confirmed" title="Your stay is on the calendar">
          <p className="rounded-md border border-success/30 bg-success-weak/40 px-5 py-6 text-sm text-ink">
            Your stay has been approved and added to the villa calendar. The
            estimated charges above will appear on your statement after the
            stay is completed.
          </p>
        </Section>
      )}

      {request.status === "rejected" && (
        <Section eyebrow="Not approved" title="Stay not confirmed">
          <p className="rounded-md border border-danger/30 bg-danger-weak/30 px-5 py-6 text-sm text-ink">
            Unfortunately your request couldn't be approved for these dates.
            Please contact your property manager to discuss alternatives.
            {request.adminNotes
              ? ` Note from the team: ${request.adminNotes}`
              : ""}
          </p>
        </Section>
      )}

      <Section eyebrow="Timeline" title="What's happened so far">
        <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          <TimelineItem
            label="Request submitted"
            at={request.createdAt}
          />
          {request.approvedAt && (
            <TimelineItem label="Approved" at={request.approvedAt} />
          )}
          {request.rejectedAt && (
            <TimelineItem label="Not approved" at={request.rejectedAt} />
          )}
          {request.completedAt && (
            <TimelineItem label="Stay completed" at={request.completedAt} />
          )}
          {request.financeBridgeStatus === "bridged" && (
            <TimelineItem
              label="Charges added to your statement"
              detail="The amounts above are now on your next statement."
              at={request.completedAt ?? request.createdAt}
            />
          )}
        </ol>
      </Section>

      {request.status === "completed" &&
        request.financeBridgeStatus === "bridged" && (
          <Section eyebrow="On your statement" title="Charges posted">
            <p className="rounded-md border border-success/30 bg-success-weak/40 px-5 py-6 text-sm text-ink">
              Charges for this stay have been added to your next statement.
              Total: {formatMoney(
                request.estimatedTotalOwnerChargeMinor,
                request.currency,
              )}
              .
            </p>
          </Section>
        )}
    </div>
  );
}

function TimelineItem({
  label,
  detail,
  at,
}: {
  label: string;
  detail?: string;
  at: string;
}) {
  return (
    <li className="p-4 flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-ink font-medium">{label}</div>
        {detail && (
          <div className="text-xs text-ink-tertiary mt-1">{detail}</div>
        )}
      </div>
      <div className="text-[11px] text-ink-tertiary tabular-nums shrink-0">
        {at.slice(0, 16).replace("T", " ")}
      </div>
    </li>
  );
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
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
