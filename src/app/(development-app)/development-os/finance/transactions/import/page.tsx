/**
 * Sprint 4 — Transaction import wizard route.
 *
 * Three tabs (Paste · Upload · Live Sheets). Live Sheets is a 4.5
 * placeholder. All other plumbing is live.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Import transactions" />
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
        <PageHeader
          breadcrumbs={[
            {
              label: "Transactions",
              href: "/development-os/finance/transactions",
            },
            { label: "Import" },
          ]}
          title="Import transactions"
          description="Paste from a spreadsheet, upload a CSV/XLSX file, or — in Sprint 4.5 — connect Google Sheets directly."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/development-os/finance/transactions">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Back to list
              </Link>
            </Button>
          }
        />

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
