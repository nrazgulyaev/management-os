import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft} from "lucide-react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getRecentWhatsappMessages,
  getWhatsappPhoneNumbers,
  getWhatsappTemplates,
} from "@/lib/development/server/whatsapp-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { getWhatsAppProvider } from "@/lib/whatsapp/providers";

export const metadata: Metadata = { title: "WhatsApp · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  received: "info",
  queued: "info",
  sent: "info",
  delivered: "ok",
  read: "ok",
  failed: "danger",
  processed: "ok",
};

const INTENT_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  site_report: "info",
  safety_alert: "danger",
  vendor_inquiry: "warn",
  investor_question: "info",
  unknown: "soft",
};

export default async function WhatsappDashboardPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>WhatsApp</span>
            </div>
            <h1>WhatsApp</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Inbound site reports + outbound notifications via WhatsApp.
            </p>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const provider = getWhatsAppProvider();
  const [recent, phones, templates] = await Promise.all([
    safeQuery(
      "getRecentWhatsappMessages",
      getRecentWhatsappMessages({ limit: 50 }),
      [],
      4000,
    ),
    safeQuery(
      "getWhatsappPhoneNumbers",
      getWhatsappPhoneNumbers(),
      [],
      4000,
    ),
    safeQuery("getWhatsappTemplates", getWhatsappTemplates(), [], 4000),
  ]);

  const inboundCount = recent.filter((m) => m.direction === "inbound").length;
  const outboundCount = recent.filter((m) => m.direction === "outbound").length;
  const failedCount = recent.filter((m) => m.status === "failed").length;
  const unknownPhones = phones.filter(
    (p) => p.numberType === "unknown",
  ).length;
  const approvedTemplates = templates.filter(
    (t) => t.approvalStatus === "approved",
  ).length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>WhatsApp</span> /{" "}
            <span>
              {provider.isSandbox()
                ? `Provider: ${provider.name} (sandbox)`
                : `Provider: ${provider.name}`}
            </span>
          </div>
          <h1>WhatsApp messages</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Site staff sends voice/text/photo via WhatsApp; the AI agent
            classifies intent and routes to a HITL draft. Outbound goes through
            approved templates only.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/whatsapp/templates"
            className="btn btn-secondary btn-sm"
          >
            Templates
          </Link>
          <Link
            href="/development-os/whatsapp/phone-numbers"
            className="btn btn-secondary btn-sm"
          >
            Phones
          </Link>
          <Link
            href="/development-os/settings/whatsapp"
            className="btn btn-secondary btn-sm"
          >
            Setup
          </Link>
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      <div className="mb-[18px]">
        <div className="label mb-2.5">Snapshot</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Inbound" value={String(inboundCount)} />
          <Kpi label="Outbound" value={String(outboundCount)} />
          <Kpi
            label="Failed"
            value={String(failedCount)}
            sub={failedCount > 0 ? "needs attention" : undefined}
            tone={failedCount > 0 ? "danger" : undefined}
          />
          <Kpi
            label="Unknown phones"
            value={String(unknownPhones)}
            sub={unknownPhones > 0 ? "needs resolution" : undefined}
            tone={unknownPhones > 0 ? "warn" : undefined}
          />
          <Kpi
            label="Approved templates"
            value={String(approvedTemplates)}
            sub={`${templates.length} total`}
          />
        </div>
      </div>

      <div className="mb-[18px]">
        <div className="label mb-2.5">Recent</div>
        {recent.length === 0 ? (
          <EmptyState
            title="No WhatsApp messages yet"
            description="Configure your Twilio credentials in Settings → WhatsApp to start receiving inbound messages."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Direction</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Type</th>
                  <th scope="col">Body / template</th>
                  <th scope="col">Intent</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td className="text-xs whitespace-nowrap">
                      {m.occurredAt
                        .toISOString()
                        .slice(0, 19)
                        .replace("T", " ")}
                    </td>
                    <td>
                      <HandoffBadge
                        tone={m.direction === "inbound" ? "info" : "soft"}
                      >
                        {m.direction}
                      </HandoffBadge>
                    </td>
                    <td className="mono text-[11px]">{m.fromPhone}</td>
                    <td className="mono text-[11px]">{m.toPhone}</td>
                    <td className="text-xs">{m.messageType}</td>
                    <td className="text-xs max-w-md truncate">
                      <Link
                        href={`/development-os/whatsapp/messages/${m.id}`}
                        className="hover:underline"
                      >
                        {m.templateName
                          ? `[${m.templateName}]`
                          : m.body
                            ? m.body.slice(0, 80)
                            : "(no body)"}
                      </Link>
                    </td>
                    <td>
                      {m.aiIntent ? (
                        <HandoffBadge tone={INTENT_TONE[m.aiIntent] ?? "soft"}>
                          {m.aiIntent}
                        </HandoffBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[m.status] ?? "soft"}>
                        {m.status}
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
