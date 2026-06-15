import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getCostCategories,
  getCostCategoryUsage,
} from "@/lib/development/server/cost-categories";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { CostCategoryModalForm } from "@/components/development/finance/cost-category-modal-form";
import { CostCategoryArchiveButton } from "@/components/development/finance/cost-category-archive-button";

export const metadata: Metadata = { title: "Cost categories · Development OS" };
export const dynamic = "force-dynamic";

export default async function CostCategoriesPage() {
  const db = getDb();
  const [cats, usage] = db
    ? await Promise.all([
        safeQuery("getCostCategories", getCostCategories(), [], 4000),
        safeQuery("getCostCategoryUsage", getCostCategoryUsage(), [], 4000),
      ])
    : [[], []];
  const usageById = new Map(usage.map((u) => [u.categoryId, u]));
  const fmtUsd = (b: bigint) =>
    `$${(Number(b) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const parents = cats.filter((c) => !c.parentCategoryId);
  const childrenByParent = new Map<string, typeof cats>();
  for (const c of cats) {
    if (c.parentCategoryId) {
      const arr = childrenByParent.get(c.parentCategoryId) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentCategoryId, arr);
    }
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Categories</span>
          </div>
          <h1>Cost categories</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Hierarchical taxonomy used by the budget, transactions, and vendor
            commitments.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/finance" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
          <CostCategoryModalForm
            parents={parents.map((p) => ({
              id: p.id,
              categoryCode: p.categoryCode,
              displayName: p.displayName,
            }))}
          />
        </div>
      </div>

      <FinanceTabs />

      {!db || cats.length === 0 ? (
        <EmptyState
          title="No categories"
          description={!db ? "Database connection not configured. Contact support." : "Add your first finance category to organize the chart of accounts."}
        />
      ) : (
        <div>
          <div className="label mb-2.5">Hierarchy</div>
          <div className="space-y-3">
            {parents.map((p) => {
              const ch = childrenByParent.get(p.id) ?? [];
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-line-soft bg-surface"
                >
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs text-ink-tertiary">
                        {p.categoryCode}
                      </div>
                      <div className="font-medium">{p.displayName}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                      <HandoffBadge tone="soft">{p.categoryType}</HandoffBadge>
                      {!p.isActive && (
                        <HandoffBadge tone="warn">Inactive</HandoffBadge>
                      )}
                      {(() => {
                        const u = usageById.get(p.id);
                        return u ? (
                          <span
                            className="badge badge-info"
                            data-testid="cost-category-usage"
                          >
                            {u.transactionCount} tx ·{" "}
                            {fmtUsd(BigInt(u.totalUsdMinor))}
                          </span>
                        ) : (
                          <HandoffBadge tone="soft">unused</HandoffBadge>
                        );
                      })()}
                      {ch.length > 0 && (
                        <span>{ch.length} children</span>
                      )}
                      <CostCategoryArchiveButton id={p.id} isActive={p.isActive} />
                    </div>
                  </div>
                  {ch.length > 0 && (
                    <div className="border-t border-line-soft px-4 py-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ch.map((c) => {
                        const u = usageById.get(c.id);
                        return (
                          <div
                            key={c.id}
                            className="text-sm flex items-center gap-2"
                          >
                            <span className="font-mono text-xs text-ink-tertiary">
                              {c.categoryCode}
                            </span>
                            <span>{c.displayName}</span>
                            {!c.isActive && (
                              <HandoffBadge tone="warn">Inactive</HandoffBadge>
                            )}
                            {u ? (
                              <span className="text-[11px] text-ink-tertiary">
                                {u.transactionCount} tx
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DevelopmentShell>
  );
}
