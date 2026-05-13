import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listChecklistTemplates } from "@/features/operations/services";

export const metadata = { title: "Operations · Checklists" };
export const dynamic = "force-dynamic";

export default async function ChecklistsPage() {
  const templates = await listChecklistTemplates();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Checklists" },
        ]}
        title="Checklist templates"
        description="Library of reusable cleaning, inspection, and maintenance checklists."
      />
      <DbStatusNotice />
      <Section eyebrow="Library" title="Templates available">
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
          {templates.length === 0 ? (
            <p className="p-6 text-sm text-ink-tertiary">
              No checklist templates yet. Add your first checklist
              template to standardize cleaning and maintenance work.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {templates.map((t) => (
                <li key={t.id} className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-ink font-medium">{t.name}</div>
                    <div className="text-xs text-ink-tertiary mt-0.5">
                      {t.category.replace(/_/g, " ")}
                      {t.villaType ? ` · ${t.villaType}` : ""} · {t.itemCount} items
                    </div>
                    {t.description && (
                      <p className="text-xs text-ink-secondary mt-2 max-w-xl">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <Badge tone="outline">{t.key}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}
