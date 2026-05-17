import _Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listMaintenanceTemplates } from "@/features/maintenance-intelligence/services";
import { TemplateAddButton } from "@/components/maintenance-intelligence/template-add-button";

export const metadata = { title: "Maintenance templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listMaintenanceTemplates();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Templates" },
        ]}
        title="Maintenance templates"
        description="Catalog of preventive checks (AC, pool, pest, garden, pump, electrical, smart-lock battery…). Plans are villa-specific instances of these templates."
        actions={<TemplateAddButton />}
      />
      <Section eyebrow="Catalog" title={`${templates.length} templates`}>
        {templates.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No templates yet.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Key</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Frequency</th>
                  <th className="text-right px-3 py-2">Duration</th>
                  <th className="text-left px-3 py-2">Disruption</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-mono text-xs text-ink-tertiary">
                      {t.key}
                    </td>
                    <td className="px-3 py-2 text-ink font-medium">{t.name}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {t.category.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {t.defaultFrequency}
                      {t.defaultIntervalDays
                        ? ` · ${t.defaultIntervalDays}d`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.defaultDurationMinutes}m
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={t.guestDisruptionLevel === "high" ? "danger" : t.guestDisruptionLevel === "medium" ? "warning" : "neutral"}>
                        {t.guestDisruptionLevel}
                        {t.requiresVillaEmpty ? " · empty" : ""}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={t.status === "active" ? "success" : "neutral"}>
                        {t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
