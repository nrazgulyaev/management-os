import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD} from "@/components/ui/table";
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
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  received: "info",
  queued: "info",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "danger",
  processed: "success",
};

const INTENT_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  site_report: "info",
  safety_alert: "danger",
  vendor_inquiry: "warning",
  investor_question: "info",
  unknown: "neutral",
};

export default async function WhatsappDashboardPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "WhatsApp" },
          ]}
          title="WhatsApp"
          description="Inbound site reports + outbound notifications via WhatsApp."
        />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "WhatsApp" },
        ]}
        eyebrow={
          provider.isSandbox()
            ? `Provider: ${provider.name} (sandbox)`
            : `Provider: ${provider.name}`
        }
        title="WhatsApp messages"
        description="Site staff sends voice/text/photo via WhatsApp; the AI agent classifies intent and routes to a HITL draft. Outbound goes through approved templates only."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/whatsapp/templates">Templates</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/whatsapp/phone-numbers">Phones</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/settings/whatsapp">Setup</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Snapshot" title="Last 50 messages">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Inbound" value={String(inboundCount)} />
          <MetricCard label="Outbound" value={String(outboundCount)} />
          <MetricCard
            label="Failed"
            value={String(failedCount)}
            hint={failedCount > 0 ? "needs attention" : undefined}
          />
          <MetricCard
            label="Unknown phones"
            value={String(unknownPhones)}
            hint={unknownPhones > 0 ? "needs resolution" : undefined}
          />
          <MetricCard
            label="Approved templates"
            value={String(approvedTemplates)}
            hint={`${templates.length} total`}
          />
        </div>
      </Section>

      <Section eyebrow="Recent" title="Last 50 messages chronologically">
        {recent.length === 0 ? (
          <EmptyState
            title="No WhatsApp messages yet"
            description="Configure your Twilio credentials in Settings → WhatsApp to start receiving inbound messages."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Direction</TH>
                <TH>From</TH>
                <TH>To</TH>
                <TH>Type</TH>
                <TH>Body / template</TH>
                <TH>Intent</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {recent.map((m) => (
                <TR key={m.id}>
                  <TD className="text-xs whitespace-nowrap">
                    {m.occurredAt
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")}
                  </TD>
                  <TD>
                    <Badge tone={m.direction === "inbound" ? "info" : "neutral"}>
                      {m.direction}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-[11px]">{m.fromPhone}</TD>
                  <TD className="font-mono text-[11px]">{m.toPhone}</TD>
                  <TD className="text-xs">{m.messageType}</TD>
                  <TD className="text-xs max-w-md truncate">
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
                  </TD>
                  <TD>
                    {m.aiIntent ? (
                      <Badge tone={INTENT_TONE[m.aiIntent] ?? "neutral"}>
                        {m.aiIntent}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>
                      {m.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
