import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listBuyers } from "@/lib/development/server/buyers/buyer-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { BuyerModalForm } from "@/components/development/sales/buyer-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Buyers · Development OS" };
export const dynamic = "force-dynamic";

const KYC_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  not_started: "soft",
  in_progress: "info",
  submitted: "info",
  verified: "ok",
  rejected: "danger",
  expired: "warn",
};

export default async function BuyersListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Buyers</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery("listBuyers", listBuyers(), [], 4000);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Buyers</span>
          </div>
          <h1>Villa buyers</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Buyers purchase specific villas. They have a separate workspace at /buyer-portal — RLS keeps their view scoped to own units + published reports only.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <BuyerModalForm />
            <ExportButton entity="buyers" />
            <Link href="/development-os" className="btn btn-secondary btn-sm">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No buyers yet"
          description="Use createBuyer to add the first buyer profile. KYC + portal invite happen as separate operator actions."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
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
                    <HandoffBadge tone={KYC_TONE[b.kycStatus] ?? "soft"}>
                      {b.kycStatus}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    {b.portalAccessEnabled ? (
                      <HandoffBadge tone="ok">enabled</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="soft">not invited</HandoffBadge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
