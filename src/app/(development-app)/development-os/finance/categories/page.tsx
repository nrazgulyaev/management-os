import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { CostCategoryModalForm } from "@/components/development/finance/cost-category-modal-form";

export const metadata: Metadata = { title: "Cost categories · Development OS" };
export const dynamic = "force-dynamic";

export default async function CostCategoriesPage() {
  const db = getDb();
  const cats = db
    ? await safeQuery("getCostCategories", getCostCategories(), [], 4000)
    : [];
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Categories" },
        ]}
        eyebrow={`${cats.length} categories (${parents.length} parents, ${cats.length - parents.length} children)`}
        title="Cost categories"
        description="Hierarchical taxonomy used by the budget, transactions, and vendor commitments."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
            <CostCategoryModalForm
              parents={parents.map((p) => ({
                id: p.id,
                categoryCode: p.categoryCode,
                displayName: p.displayName,
              }))}
            />
          </div>
        }
      />

      <FinanceTabs />

      {!db || cats.length === 0 ? (
        <EmptyState
          title="No categories"
          description={!db ? "Set DATABASE_URL." : "Run npm run db:seed:dev-os."}
        />
      ) : (
        <Section eyebrow="Hierarchy" title="Tree view">
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
                      <Badge tone="neutral">{p.categoryType}</Badge>
                      {!p.isActive && <Badge tone="warning">Inactive</Badge>}
                      {ch.length > 0 && (
                        <span>{ch.length} children</span>
                      )}
                    </div>
                  </div>
                  {ch.length > 0 && (
                    <div className="border-t border-line-soft px-4 py-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ch.map((c) => (
                        <div
                          key={c.id}
                          className="text-sm flex items-center gap-2"
                        >
                          <span className="font-mono text-xs text-ink-tertiary">
                            {c.categoryCode}
                          </span>
                          <span>{c.displayName}</span>
                          {!c.isActive && (
                            <Badge tone="warning">Inactive</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
