import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWhatsappPhoneNumbers } from "@/lib/development/server/whatsapp-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "WhatsApp phones · Development OS",
};
export const dynamic = "force-dynamic";

const TYPE_TONE: Record<
  string,
  "info" | "success" | "warning" | "neutral"
> = {
  arconique_outbound: "success",
  arconique_inbound: "success",
  recipient: "info",
  unknown: "warning",
};

export default async function WhatsappPhoneNumbersPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="WhatsApp phones" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const phones = await safeQuery(
    "getWhatsappPhoneNumbers",
    getWhatsappPhoneNumbers(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "WhatsApp", href: "/development-os/whatsapp" },
          { label: "Phone numbers" },
        ]}
        eyebrow={`${phones.length} registered`}
        title="WhatsApp phone registry"
        description="Every phone number Arconique knows about — outbound numbers we send from, recipient numbers we send to (vendors / investors / staff), and unknown inbound numbers awaiting operator resolution."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/whatsapp">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              WhatsApp
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Registry" title="All known phones">
        {phones.length === 0 ? (
          <EmptyState
            title="No phones registered"
            description="Phones land here automatically when inbound messages arrive, or you can register Arconique outbound numbers manually."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Phone</TH>
                <TH>Display name</TH>
                <TH>Type</TH>
                <TH>Resolves to</TH>
                <TH>Provider</TH>
                <TH>Verified</TH>
                <TH>Last message</TH>
                <TH>In</TH>
                <TH>Out</TH>
              </TR>
            </THead>
            <TBody>
              {phones.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.phoneNumber}</TD>
                  <TD className="text-sm">{p.displayName ?? "—"}</TD>
                  <TD>
                    <Badge tone={TYPE_TONE[p.numberType] ?? "neutral"}>
                      {p.numberType}
                    </Badge>
                  </TD>
                  <TD className="text-xs">
                    {p.resolvedEntityType
                      ? `${p.resolvedEntityType} ${p.resolvedEntityId?.slice(0, 8) ?? ""}`
                      : "—"}
                  </TD>
                  <TD className="text-xs text-ink-secondary">{p.provider}</TD>
                  <TD className="text-xs">{p.isVerified ? "✓" : "—"}</TD>
                  <TD className="text-xs">
                    {p.lastMessageAt
                      ? p.lastMessageAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "—"}
                  </TD>
                  <TDNum>{p.totalMessagesReceived}</TDNum>
                  <TDNum>{p.totalMessagesSent}</TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
