import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TableEmpty } from "@/components/ui/table-empty";
import { listNotificationDeliveries } from "@/features/notifications/services";

export const metadata = { title: "Notification deliveries" };
export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, string> = {
  pending: "badge-info",
  sent: "badge-ok",
  failed: "badge-danger",
  skipped: "badge-soft",
  suppressed: "badge-soft",
};

const PROVIDER_BADGES: Record<string, string> = {
  in_app: "badge-ink",
  resend: "badge-info",
  twilio: "badge-info",
  noop: "badge-soft",
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

  const sentCount = rows.filter((r) => r.status === "sent").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/notifications">Notifications</Link> /{" "}
            <span>Deliveries</span>
          </div>
          <h1>Delivery log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Per-attempt provider records. Provider responses are internal-only
            — no owner/guest access.
          </p>
        </div>
        <div className="actions">
          <span className="mono text-[11px] text-ink-3">
            {rows.length} attempts in view
          </span>
        </div>
      </div>

      <DbStatusNotice />

      <div className="gs-kpis">
        <Kpi label="Attempts" value={String(rows.length)} sub="in view" />
        <Kpi
          label="Sent"
          value={String(sentCount)}
          tone={sentCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(failedCount)}
          tone={failedCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Pending"
          value={String(pendingCount)}
          tone={pendingCount > 0 ? "accent" : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-[14px]">
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

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Channel</th>
              <th scope="col">Provider</th>
              <th scope="col">Status</th>
              <th scope="col">Recipient</th>
              <th scope="col">Provider message id</th>
              <th scope="col">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>
                No delivery attempts match these filters yet.
              </TableEmpty>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
                    {(r.attemptedAt ?? r.createdAt).slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    <span className="badge">{r.channel}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${PROVIDER_BADGES[r.provider] ?? "badge-soft"}`}
                    >
                      {r.provider}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${STATUS_BADGES[r.status] ?? "badge-soft"}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="text-[12px] text-ink-3 truncate max-w-[200px]">
                    {r.recipientAddress ?? <span className="text-ink-4">—</span>}
                  </td>
                  <td className="mono text-[11px] text-ink-4 truncate max-w-[200px]">
                    {r.providerMessageId ?? "—"}
                  </td>
                  <td className="text-[12px] text-danger truncate max-w-[260px]">
                    {r.errorMessage ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
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
    <Link href={href} className={active ? "filter-chip on" : "filter-chip"}>
      {label}
    </Link>
  );
}
