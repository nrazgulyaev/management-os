import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listChecklistTemplates } from "@/features/operations/services";
import { ChecklistTemplateAddButton } from "@/components/operations/checklist-template-add-button";

export const metadata = { title: "Operations · Checklists" };
export const dynamic = "force-dynamic";

export default async function ChecklistsPage() {
  const templates = await listChecklistTemplates();
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <span>Checklists</span>
          </div>
          <h1>Checklist templates</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Library of reusable cleaning, inspection, and maintenance checklists.
          </p>
        </div>
        <div className="actions">
          <ChecklistTemplateAddButton />
        </div>
      </div>
      <DbStatusNotice />
      <div>
        <div className="label mb-2.5">Library</div>
        <Card padding="none" overflowHidden>
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
                  <HandoffBadge tone="soft">{t.key}</HandoffBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
