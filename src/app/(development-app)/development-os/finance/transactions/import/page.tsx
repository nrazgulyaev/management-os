/**
 * Transaction import wizard route.
 *
 * Two tabs (Paste · Upload CSV/XLSX) — both live.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import { safeQuery } from "@/lib/development/safe-query";
import {
  ImportWizard,
  type ImportBankAccountOption,
} from "./import-wizard";

export const metadata: Metadata = {
  title: "Import transactions · Development OS",
};
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Import transactions</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the import wizard."
        />
      </DevelopmentShell>
    );
  }

  const accounts = await safeQuery("bank-accounts", getBankAccounts(), []);
  const bankAccounts: ImportBankAccountOption[] = accounts
    .filter((a) => a.isActive)
    .map((a) => ({
      id: a.id,
      label: `${a.accountCode} · ${a.accountName}`,
      currency: a.currency,
    }));

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-6">
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os/finance/transactions">Transactions</Link> /{" "}
              <span>Import</span>
            </div>
            <h1>Import transactions</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Paste rows from a spreadsheet, or upload a CSV/XLSX file. Headers
              auto-map; save a column-mapping template to reuse next time.
            </p>
          </div>
          <div className="actions">
            <Link
              href="/development-os/finance/transactions"
              className="btn btn-secondary btn-sm"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to list
            </Link>
          </div>
        </div>

        {bankAccounts.length === 0 ? (
          <EmptyState
            title="No bank accounts configured"
            description="Add a bank account before importing transactions."
          />
        ) : (
          <ImportWizard bankAccounts={bankAccounts} />
        )}
      </div>
    </DevelopmentShell>
  );
}
