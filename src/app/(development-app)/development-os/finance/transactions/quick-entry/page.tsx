/**
 * Sprint 4 — Quick-entry route.
 *
 * Server page that loads bank accounts + cost-category names + project
 * slugs, then mounts the <QuickEntryForm> client island wrapping
 * <SpreadsheetView>. Operators land here from the cabinet apex's "Add
 * transactions" affordance or via direct URL.
 *
 * Empty rows default to 12 — enough for a daily bookkeeper sit-down.
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
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import {
  QuickEntryForm,
  type BankAccountOption,
} from "./quick-entry-form";

export const metadata: Metadata = {
  title: "Quick entry · Transactions · Development OS",
};
export const dynamic = "force-dynamic";

export default async function QuickEntryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Quick entry" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the Sheets-style bookkeeper entry."
        />
      </DevelopmentShell>
    );
  }

  const [accounts, categories, devProjects] = await Promise.all([
    safeQuery("bank-accounts", getBankAccounts(), []),
    safeQuery("cost-categories", getCostCategories(), []),
    safeQuery("development-projects", getDevelopmentProjects(), []),
  ]);

  const bankAccounts: BankAccountOption[] = accounts
    .filter((a) => a.isActive)
    .map((a) => ({
      id: a.id,
      label: `${a.accountCode} · ${a.accountName}`,
      currency: a.currency,
    }));

  const catalog = {
    categories: categories.map((c) => c.displayName),
    projects: devProjects.map((p) => p.slug ?? p.name).filter(Boolean) as string[],
  };

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            {
              label: "Transactions",
              href: "/development-os/finance/transactions",
            },
            { label: "Quick entry" },
          ]}
          title="Bookkeeper quick entry"
          description="Type or paste rows from your spreadsheet. Tab/Enter to move across cells; Ctrl/Cmd-S to save."
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
            description="Add at least one bank account before recording transactions."
            action={
              <Link
                href="/development-os/finance/bank-accounts"
                className="inline-flex items-center px-4 py-2 rounded-sm bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
              >
                Open bank accounts
              </Link>
            }
          />
        ) : (
          <QuickEntryForm
            bankAccounts={bankAccounts}
            catalog={catalog}
          />
        )}
      </div>
    </DevelopmentShell>
  );
}
