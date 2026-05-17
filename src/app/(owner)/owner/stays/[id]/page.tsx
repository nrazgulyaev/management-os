import { notFound } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
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
      <SectionHeading
        eyebrow={`Portfolio · stays · ${id.slice(0, 8)}`}
        title={`${request.villaCode ?? "Villa"} · ${request.requestedStart} → ${request.requestedEnd}`}
        subtitle="Your owner stay request — status, allowance, estimated charges."
        actions={
          CANCELLABLE.has(request.status) ? (
            <OwnerCancelStayButton id={request.id} />
          ) : null
        }
      />

      <section>
        <div className="label">Status</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          {PUBLIC_STATUS[request.status] ?? request.status}
        </h2>
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
      </section>

      {request.relocationRequired && request.status !== "approved" && (
        <Card style={{ padding: 20 }}>
          <div className="label">Heads up</div>
          <h2 className="display" style={{ fontSize: 18, marginTop: 6, marginBottom: 10, fontWeight: 500 }}>
            Some dates need extra review
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
            Some of your selected dates overlap with existing reservations.
            Our team is reviewing whether the stay can be accommodated. You&apos;ll
            be notified as soon as a decision is made.
          </p>
        </Card>
      )}

      {request.status === "approved" && (
        <Card style={{ padding: 20, borderColor: "var(--ok, var(--forest))" }}>
          <div className="label">Confirmed</div>
          <h2 className="display" style={{ fontSize: 18, marginTop: 6, marginBottom: 10, fontWeight: 500 }}>
            Your stay is on the calendar
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink)", margin: 0 }}>
            Your stay has been approved and added to the villa calendar. The
            estimated charges above will appear on your statement after the
            stay is completed.
          </p>
        </Card>
      )}

      {request.status === "rejected" && (
        <Card style={{ padding: 20 }}>
          <div className="label">Not approved</div>
          <h2 className="display" style={{ fontSize: 18, marginTop: 6, marginBottom: 10, fontWeight: 500 }}>
            Stay not confirmed
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink)", margin: 0 }}>
            Unfortunately your request couldn&apos;t be approved for these dates.
            Please contact your property manager to discuss alternatives.
            {request.adminNotes
              ? ` Note from the team: ${request.adminNotes}`
              : ""}
          </p>
        </Card>
      )}

      <section>
        <div className="label">Timeline</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          What&apos;s happened so far
        </h2>
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
      </section>

      {request.status === "completed" &&
        request.financeBridgeStatus === "bridged" && (
          <Card style={{ padding: 20 }}>
            <div className="label">On your statement</div>
            <h2 className="display" style={{ fontSize: 18, marginTop: 6, marginBottom: 10, fontWeight: 500 }}>
              Charges posted
            </h2>
            <p style={{ fontSize: 14, color: "var(--ink)", margin: 0 }}>
              Charges for this stay have been added to your next statement.
              Total: {formatMoney(
                request.estimatedTotalOwnerChargeMinor,
                request.currency,
              )}
              .
            </p>
          </Card>
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
