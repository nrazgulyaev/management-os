import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWhatsappTemplates } from "@/lib/development/server/whatsapp-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "WhatsApp templates · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "info",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  inactive: "neutral",
};

export default async function WhatsappTemplatesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="WhatsApp templates" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const templates = await safeQuery(
    "getWhatsappTemplates",
    getWhatsappTemplates(),
    [],
    4000,
  );
  const counts = templates.reduce<Record<string, number>>((acc, t) => {
    acc[t.approvalStatus] = (acc[t.approvalStatus] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "WhatsApp", href: "/development-os/whatsapp" },
          { label: "Templates" },
        ]}
        eyebrow={`${templates.length} templates · ${counts.approved ?? 0} approved`}
        title="WhatsApp message templates"
        description="Pre-approved templates required for proactive outbound messaging outside the 24h conversation window. Submit to Meta via Twilio Console for approval (typically 24-48h)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/whatsapp">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              WhatsApp
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Catalog" title="All templates">
        {templates.length === 0 ? (
          <EmptyState
            title="No templates registered"
            description="Add your first WhatsApp template to enable outbound messaging."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>Display name</TH>
                <TH>Languages</TH>
                <TH>Variables</TH>
                <TH>Trigger event</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {templates.map((t) => {
                const langs = Object.keys(
                  (t.languageVersions as Record<string, unknown>) ?? {},
                );
                return (
                  <TR key={t.id}>
                    <TD className="font-mono text-xs">{t.templateKey}</TD>
                    <TD className="text-sm">{t.displayName}</TD>
                    <TD className="text-xs">
                      {langs.length > 0
                        ? langs.map((l) => l.toUpperCase()).join(" · ")
                        : "—"}
                    </TD>
                    <TD className="text-xs">
                      {t.expectedVariables && t.expectedVariables.length > 0
                        ? t.expectedVariables.join(", ")
                        : "—"}
                    </TD>
                    <TD className="text-xs">
                      {t.notificationEventType ?? "—"}
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[t.approvalStatus] ?? "neutral"}>
                        {t.approvalStatus}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
