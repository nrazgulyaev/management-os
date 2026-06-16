import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Badge } from "@/components/ui/badge";
import { listPaymentWebhookEvents } from "@/features/direct-booking/deposits";
import { requireOrgId } from "@/features/auth/require-org";

export const metadata = { title: "Payment webhooks" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "info" | "success" | "warning" | "neutral" | "danger"
> = {
  received: "info",
  processed: "success",
  ignored: "neutral",
  failed: "danger",
};

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function WebhooksPage() {
  const organizationId = await requireOrgId();
  const rows = await listPaymentWebhookEvents({ limit: 200, organizationId });
  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/payments">Payments</Link> / <span>Webhooks</span>
          </div>
          <h1>Payment webhooks</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Incoming provider events — idempotent via{" "}
            <code>UNIQUE (provider_key, external_event_id)</code>. The manual stub
            never writes here.
          </p>
        </div>
        <div className="actions">
          <span className="mono text-[11px] text-ink-3">{rows.length} events</span>
        </div>
      </div>

      <div className="card p-0 overflow-hidden mt-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Provider</th>
              <th scope="col">Type</th>
              <th scope="col">External ID</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>No webhook events yet.</TableEmpty>
            ) : (
              rows.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(e.createdAt)}
                  </td>
                  <td className="mono text-[12px]">{e.providerKey}</td>
                  <td className="text-[12px]">{e.eventType}</td>
                  <td className="mono text-[11px] text-ink-3">{e.externalEventId ?? "—"}</td>
                  <td>
                    <Badge tone={STATUS_TONES[e.status] ?? "neutral"}>{e.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
