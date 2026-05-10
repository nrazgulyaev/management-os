import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { bankConnections } from "@/lib/db/schema/banking";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Banking · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> =
  {
    active: "success",
    error: "danger",
    pending: "warning",
    paused: "warning",
    archived: "neutral",
    connecting: "warning",
  };

export default async function BankingPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Banking" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const org = await safeQuery(
    "banking.getOrganizationByCode",
    getOrganizationByCode("ARCONIQUE_DEFAULT"),
    null,
  );
  const rows = org
    ? await safeQuery(
        "banking.bankConnections",
        db
          .select()
          .from(bankConnections)
          .where(eq(bankConnections.organizationId, org.id)),
        [] as Array<typeof bankConnections.$inferSelect>,
      )
    : [];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Banking" },
        ]}
        eyebrow={`${rows.length} connections · ${rows.filter((r) => r.status === "active").length} active`}
        title="Bank connections"
        description="Per-account integrations. Revolut + Wise sync via API; Mandiri + BCA + manual accounts ingest via CSV statement upload at /finance/transactions."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="primary">
              <Link href="/development-os/banking/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Add bank connection
              </Link>
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

      <Section title="Connections">
        {rows.length === 0 ? (
          <EmptyState
            title="No bank connections yet"
            description="Click 'Add bank connection' to wire Revolut Business, Wise, Mandiri, BCA, or a manual account."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Provider</TH>
                <TH>Account</TH>
                <TH>Currency</TH>
                <TH>Status</TH>
                <TH>Last sync</TH>
                <TH>Result</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/development-os/banking/${c.id}`}
                      className="hover:underline"
                    >
                      <Badge tone="outline">{c.provider}</Badge>
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    <Link
                      href={`/development-os/banking/${c.id}`}
                      className="hover:underline"
                    >
                      {c.accountName ?? c.externalAccountId}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs">{c.currency}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {c.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {c.lastSyncedAt
                      ? c.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </TD>
                  <TD className="text-xs">{c.lastSyncStatus ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
