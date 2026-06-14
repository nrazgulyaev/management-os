/**
 * Sprint MD-1 — Quotation paste-import wizard route.
 *
 * Server page that loads the open POL of purchase requests + the
 * vendor list, then mounts <QuotationImportWizard>. Same 3-tab
 * pattern as Sprint 4's transaction import wizard:
 *   Tab A — Paste TSV/CSV
 *   Tab B — Upload XLSX
 *   Tab C — Live Google Sheets (4.5 placeholder)
 *
 * All three tabs commit through `bulkInsertQuotationLines`. The
 * picked PR is shared across the session (mirrors Sprint 4's
 * bankAccountId pattern).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import { devOsPurchaseRequests } from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";
import {
  QuotationImportWizard,
  type QuotationPrOption,
} from "./import-wizard";

export const metadata: Metadata = {
  title: "Quotation import · Development OS",
};
export const dynamic = "force-dynamic";

const PR_OPEN_STATUSES = ["approved", "quotations_in_progress"] as const;

export default async function QuotationImportPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Quotation import</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the quotation import wizard."
        />
      </DevelopmentShell>
    );
  }

  const [prs, vendorList] = await Promise.all([
    safeQuery(
      "open-prs",
      db
        .select({
          id: devOsPurchaseRequests.id,
          requestCode: devOsPurchaseRequests.requestCode,
          materialName: devOsPurchaseRequests.materialName,
          requiredByDate: devOsPurchaseRequests.requiredByDate,
          status: devOsPurchaseRequests.status,
        })
        .from(devOsPurchaseRequests)
        .where(inArray(devOsPurchaseRequests.status, PR_OPEN_STATUSES))
        .orderBy(desc(devOsPurchaseRequests.submittedAt)),
      [] as Array<{
        id: string;
        requestCode: string;
        materialName: string;
        requiredByDate: string;
        status: string;
      }>,
    ),
    safeQuery(
      "vendors-for-quotation-import",
      db
        .select({
          vendorCode: vendors.vendorCode,
          legalName: vendors.legalName,
        })
        .from(vendors)
        .orderBy(asc(vendors.legalName)),
      [] as Array<{ vendorCode: string; legalName: string }>,
    ),
  ]);

  const prOptions: QuotationPrOption[] = prs.map((p) => ({
    id: p.id,
    requestCode: p.requestCode,
    materialName: p.materialName,
    requiredByDate: p.requiredByDate,
    status: p.status,
  }));
  const vendorNames = vendorList.map((v) => v.legalName);

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-6">
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Procurement</span> /{" "}
              <Link href="/development-os/procurement/quotation-comparison">
                Quotation comparison
              </Link>{" "}
              / <span>Import</span>
            </div>
            <h1>Quotation import</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Paste vendor quote rows from a spreadsheet, upload an XLSX file, or
              — in Sprint 4.5 — connect Google Sheets. The wizard groups rows by
              vendor and creates one procurement_quotations row per (PR, vendor)
              pair.
            </p>
          </div>
          <div className="actions">
            <Link
              href="/development-os/procurement/quotation-comparison"
              className="btn btn-secondary btn-sm"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to comparisons
            </Link>
          </div>
        </div>

        {prOptions.length === 0 ? (
          <EmptyState
            title="No open purchase requests"
            description="An approved or in-progress purchase request is needed before importing quotations."
            action={
              <Link
                href="/development-os/procurement/purchase-requests/new"
                className="btn btn-accent btn-sm"
              >
                Raise a PR
              </Link>
            }
          />
        ) : (
          <QuotationImportWizard
            prs={prOptions}
            vendorNames={vendorNames}
          />
        )}
      </div>
    </DevelopmentShell>
  );
}
