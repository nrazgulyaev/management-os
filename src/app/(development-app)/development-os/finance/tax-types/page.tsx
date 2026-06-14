import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listAllTaxTypes } from "@/lib/development/server/tax/tax-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { DevOsRowActions } from "@/components/development/dev-os-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Tax types · Development OS" };
export const dynamic = "force-dynamic";

export default async function TaxTypesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Tax types</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const types = await safeQuery(
    "listAllTaxTypes",
    listAllTaxTypes(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Tax types</span>
          </div>
          <h1>Tax types</h1>
          <div className="label mt-1.5">
            {types.length} types · {types.filter((t) => t.isActive).length} active
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Operator-configurable tax types. NOT hardcoded; edit
            rates/applicability/reporting period as needed. Used by the
            per-transaction classification flow on the transaction detail page.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/finance">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Finance
            </Link>
          </Button>
        </div>
      </div>

      {types.length === 0 ? (
        <NoItemsYet
          entityLabel="tax types"
          description="Add your first tax type — typical Indonesian setup includes PPN, PPh23, lease tax, and corporate income."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
          <Table>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>Display name</TH>
                <TH>Rate</TH>
                <TH>Included</TH>
                <TH>Payable by</TH>
                <TH>Period</TH>
                <TH>Authority</TH>
                <TH>Country</TH>
                <TH>Active</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {types.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs">{t.typeKey}</TD>
                  <TD className="text-sm">{t.displayName}</TD>
                  <TDNum>{Number(t.ratePercentage).toFixed(2)}%</TDNum>
                  <TD className="text-xs">
                    {t.isIncludedInAmount ? "yes" : "added"}
                  </TD>
                  <TD className="text-xs">{t.payableBy}</TD>
                  <TD className="text-xs">{t.reportingPeriod}</TD>
                  <TD className="text-xs">{t.reportingAuthority ?? "—"}</TD>
                  <TD className="text-xs">{t.countryCode ?? "—"}</TD>
                  <TD>
                    <HandoffBadge tone={t.isActive ? "ok" : "soft"}>
                      {t.isActive ? "active" : "inactive"}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-right">
                    <DevOsRowActions
                      kind="tax_type"
                      row={{
                        id: t.id,
                        displayName: t.displayName,
                        values: {
                          typeKey: t.typeKey,
                          displayName: t.displayName,
                          ratePercentage: Number(t.ratePercentage),
                          isIncludedInAmount: t.isIncludedInAmount,
                          payableBy: t.payableBy,
                          reportingPeriod: t.reportingPeriod,
                          reportingAuthority: t.reportingAuthority ?? "",
                          countryCode: t.countryCode ?? "ID",
                          regionCode: t.regionCode ?? "",
                          notes: t.notes ?? "",
                        },
                      }}
                    />
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
