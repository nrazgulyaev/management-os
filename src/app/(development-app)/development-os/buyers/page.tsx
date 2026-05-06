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
import { listBuyers } from "@/lib/development/server/buyers/buyer-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Buyers · Development OS" };
export const dynamic = "force-dynamic";

const KYC_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  not_started: "neutral",
  in_progress: "info",
  submitted: "info",
  verified: "success",
  rejected: "danger",
  expired: "warning",
};

export default async function BuyersListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Buyers" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery("listBuyers", listBuyers(), [], 4000);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Buyers" },
        ]}
        eyebrow={`${rows.length} buyer${rows.length === 1 ? "" : "s"}`}
        title="Villa buyers"
        description="Buyers purchase specific villas. They have a separate workspace at /buyer-portal — RLS keeps their view scoped to own units + published reports only."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No buyers yet"
          description="Use createBuyer to add the first buyer profile. KYC + portal invite happen as separate operator actions."
        />
      ) : (
        <Section eyebrow="Catalog" title="All buyers">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Language</TH>
                <TH>KYC</TH>
                <TH>Portal access</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/buyers/${b.buyerCode}`}
                      className="hover:underline"
                    >
                      {b.buyerCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{b.displayName}</TD>
                  <TD className="text-xs">{b.primaryEmail ?? "—"}</TD>
                  <TD className="text-xs">{b.preferredLanguage}</TD>
                  <TD>
                    <Badge tone={KYC_TONE[b.kycStatus] ?? "neutral"}>
                      {b.kycStatus}
                    </Badge>
                  </TD>
                  <TD>
                    {b.portalAccessEnabled ? (
                      <Badge tone="success">enabled</Badge>
                    ) : (
                      <Badge tone="neutral">not invited</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
