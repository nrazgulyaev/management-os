import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getOwnerStayRequestById } from "@/features/owner-stays/services";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { OwnerCancelStayButton } from "@/components/owner-stays/owner-cancel-button";

/**
 * P1 owner-rental-pool — owner-stay detail re-skin.
 *
 * Re-skinned off the older dashboard primitives (SectionHeading/Card) onto
 * the owner-portal lineage (display headers + status panel + terra links).
 *
 * Security: the previous version trusted a not-actually-enforced RLS note.
 * There is no `set_config`-based RLS for owner-portal sessions, so we now
 * resolve the owner from the session and refuse any request that does not
 * belong to them (explicit ownership check — no IDOR).
 */

export const metadata = { title: "Owner stay" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  requested: "info",
  availability_check: "info",
  requires_relocation: "warning",
  pending_admin_approval: "warning",
  approved: "success",
  confirmed: "success",
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
  confirmed: "Confirmed",
  rejected: "Not approved",
  cancelled: "Cancelled",
  completed: "Completed",
};

// Mirrors cancelOwnerStayRequestAction's accepted statuses — approved /
// confirmed stays are cancelled from the calendar's grid control instead.
const CANCELLABLE = new Set([
  "requested",
  "availability_check",
  "requires_relocation",
  "pending_admin_approval",
]);

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default async function OwnerStayDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getCurrentOwnerContext().catch(() => null);
  if (!owner) redirect("/dashboard");

  const request = await getOwnerStayRequestById(id);
  // Explicit ownership scope — the read is not RLS-protected, so refuse
  // any request that does not belong to the authenticated owner.
  if (!request || request.ownerId !== owner.ownerId) notFound();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[200px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary mb-2">
            Portfolio · stays · {id.slice(0, 8)}
          </div>
          <h1
            className="display"
            style={{ fontSize: 36, fontWeight: 400, margin: 0, lineHeight: 1.06, letterSpacing: "-0.02em", color: "var(--ink)" }}
          >
            {request.villaCode ?? "Villa"}
          </h1>
          <p className="text-sm text-ink-secondary mt-2 tabular-nums">
            {request.requestedStart} → {request.requestedEnd}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/owner/stays" className="btn btn-secondary btn-sm">
            ← My stays
          </Link>
          {CANCELLABLE.has(request.status) && (
            <OwnerCancelStayButton id={request.id} />
          )}
        </div>
      </div>

      {/* Status panel */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="display" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
            {PUBLIC_STATUS[request.status] ?? request.status}
          </h2>
          <Badge tone={STATUS_TONES[request.status] ?? "neutral"}>
            {PUBLIC_STATUS[request.status] ?? request.status}
          </Badge>
        </div>
        <div className="rounded-lg border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-3 gap-5 text-sm">
          <Field label="Allowance nights" value={String(request.allowanceNightsApplied)} />
          <Field label="Billable nights" value={String(request.billableNights)} />
          <Field
            label="Operational cost"
            value={formatMoney(request.estimatedOperationalCostMinor, request.currency)}
          />
          <Field
            label="Pool / mgmt compensation"
            value={formatMoney(request.estimatedManagementCompensationMinor, request.currency)}
          />
          <Field
            label="Estimated total charge"
            value={formatMoney(request.estimatedTotalOwnerChargeMinor, request.currency)}
          />
        </div>
      </section>

      {request.relocationRequired && request.status !== "approved" && (
        <NoticeCard
          label="Heads up"
          title="Some dates need extra review"
          tone="gold"
          body="Some of your selected dates overlap with existing reservations. Our team is reviewing whether the stay can be accommodated. You'll be notified as soon as a decision is made."
        />
      )}

      {request.status === "approved" && (
        <NoticeCard
          label="Confirmed"
          title="Your stay is on the calendar"
          tone="forest"
          body="Your stay has been approved and added to the villa calendar. The estimated charges above will appear on your statement after the stay is completed."
        />
      )}

      {request.status === "rejected" && (
        <NoticeCard
          label="Not approved"
          title="Stay not confirmed"
          tone="terra"
          body={`Unfortunately your request couldn't be approved for these dates. Please contact your property manager to discuss alternatives.${request.adminNotes ? ` Note from the team: ${request.adminNotes}` : ""}`}
        />
      )}

      {/* Timeline */}
      <section className="flex flex-col gap-4">
        <h2 className="display" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
          What&apos;s happened so far
        </h2>
        <ol className="rounded-lg border border-line-soft bg-surface divide-y divide-line-soft overflow-hidden">
          <TimelineItem label="Request submitted" at={request.createdAt} />
          {request.approvedAt && <TimelineItem label="Approved" at={request.approvedAt} />}
          {request.rejectedAt && <TimelineItem label="Not approved" at={request.rejectedAt} />}
          {request.completedAt && <TimelineItem label="Stay completed" at={request.completedAt} />}
          {request.financeBridgeStatus === "bridged" && (
            <TimelineItem
              label="Charges added to your statement"
              detail="The amounts above are now on your next statement."
              at={request.completedAt ?? request.createdAt}
            />
          )}
        </ol>
      </section>

      {request.status === "completed" && request.financeBridgeStatus === "bridged" && (
        <NoticeCard
          label="On your statement"
          title="Charges posted"
          tone="forest"
          body={`Charges for this stay have been added to your next statement. Total: ${formatMoney(request.estimatedTotalOwnerChargeMinor, request.currency)}.`}
        />
      )}
    </div>
  );
}

const TONE_BORDER: Record<"gold" | "forest" | "terra", string> = {
  gold: "var(--gold)",
  forest: "var(--forest)",
  terra: "var(--terra)",
};

function NoticeCard({
  label,
  title,
  body,
  tone,
}: {
  label: string;
  title: string;
  body: string;
  tone: "gold" | "forest" | "terra";
}) {
  return (
    <div
      className="rounded-lg border bg-surface p-5"
      style={{ borderColor: TONE_BORDER[tone] }}
    >
      <div className="label">{label}</div>
      <h3 className="display" style={{ fontSize: 18, marginTop: 6, marginBottom: 10, fontWeight: 400, color: "var(--ink)" }}>
        {title}
      </h3>
      <p className="text-sm text-ink-secondary m-0">{body}</p>
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
        {detail && <div className="text-xs text-ink-tertiary mt-1">{detail}</div>}
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="mt-1 text-ink">{value}</div>
    </div>
  );
}
