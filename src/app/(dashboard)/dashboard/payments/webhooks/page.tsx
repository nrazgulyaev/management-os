import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listPaymentWebhookEvents } from "@/features/direct-booking/deposits";

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

export default async function WebhooksPage() {
  const rows = await listPaymentWebhookEvents({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Payments", href: "/dashboard/payments" },
          { label: "Webhooks" },
        ]}
        title="Payment webhooks"
        description="Incoming provider events. Idempotent via UNIQUE (provider_key, external_event_id). Manual stub never writes here."
      />
      <Section eyebrow="History" title={`${rows.length} events`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">External ID</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No webhook events yet.
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {e.createdAt.toISOString()}
                  </td>
                  <td className="px-4 py-3 text-xs">{e.providerKey}</td>
                  <td className="px-4 py-3 text-xs">{e.eventType}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {e.externalEventId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[e.status] ?? "neutral"}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
