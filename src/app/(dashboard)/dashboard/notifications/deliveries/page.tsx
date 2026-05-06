import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listNotificationDeliveries } from "@/features/notifications/services";

export const metadata = { title: "Notification deliveries" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  pending: "info",
  sent: "success",
  failed: "danger",
  skipped: "neutral",
  suppressed: "neutral",
};

const PROVIDER_TONES: Record<string, "neutral" | "warning" | "info" | "success" | "accent"> = {
  in_app: "accent",
  resend: "info",
  twilio: "info",
  noop: "neutral",
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; provider?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listNotificationDeliveries({
    status: sp.status,
    channel: sp.channel,
    provider: sp.provider,
    limit: 300,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Notifications", href: "/dashboard/notifications" },
          { label: "Deliveries" },
        ]}
        title="Delivery log"
        description="Per-attempt provider records. Provider responses are internal-only — no owner/guest access."
      />
      <DbStatusNotice />

      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" href="/dashboard/notifications/deliveries" active={!sp.status} />
        {["pending", "sent", "failed", "skipped", "suppressed"].map((s) => (
          <FilterPill
            key={s}
            label={s}
            href={`/dashboard/notifications/deliveries?status=${s}`}
            active={sp.status === s}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No delivery attempts match these filters yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Channel</TH>
              <TH>Provider</TH>
              <TH>Status</TH>
              <TH>Recipient</TH>
              <TH>Provider message id</TH>
              <TH>Error</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-xs text-ink-tertiary tabular-nums">
                  {(r.attemptedAt ?? r.createdAt).slice(0, 16).replace("T", " ")}
                </TD>
                <TD>
                  <Badge tone="outline">{r.channel}</Badge>
                </TD>
                <TD>
                  <Badge tone={PROVIDER_TONES[r.provider] ?? "neutral"}>{r.provider}</Badge>
                </TD>
                <TD>
                  <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                </TD>
                <TD className="text-xs text-ink-secondary truncate max-w-[200px]">
                  {r.recipientAddress ?? <span className="text-ink-tertiary">—</span>}
                </TD>
                <TD className="text-[11px] text-ink-tertiary font-mono truncate max-w-[200px]">
                  {r.providerMessageId ?? "—"}
                </TD>
                <TD className="text-xs text-danger truncate max-w-[260px]">
                  {r.errorMessage ?? "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full border ${
        active
          ? "bg-ink text-ink-inverse border-ink"
          : "border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}
