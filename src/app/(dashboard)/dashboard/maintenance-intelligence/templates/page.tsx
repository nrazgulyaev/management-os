import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listMaintenanceTemplates } from "@/features/maintenance-intelligence/services";
import { TemplateAddButton } from "@/components/maintenance-intelligence/template-add-button";
import { TemplateRowActions } from "@/components/maintenance-intelligence/template-row-actions";

export const metadata = { title: "Maintenance templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listMaintenanceTemplates();
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/maintenance-intelligence">Maintenance intelligence</Link> /{" "}
            <span>Templates</span>
          </div>
          <h1>Maintenance templates</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Catalog of preventive checks (AC, pool, pest, garden, pump, electrical, smart-lock battery…). Plans are villa-specific instances of these templates.
          </p>
        </div>
        <div className="actions">
          <TemplateAddButton />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Catalog · {templates.length} templates</div>
        {templates.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No templates yet.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Frequency</th>
                  <th scope="col" className="num">Duration</th>
                  <th scope="col">Disruption</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className={t.status === "archived" ? "opacity-60" : undefined}>
                    <td className="mono text-[12px] text-ink-3">{t.key}</td>
                    <td className="row-title">{t.name}</td>
                    <td>{t.category.replace(/_/g, " ")}</td>
                    <td>
                      {t.defaultFrequency}
                      {t.defaultIntervalDays
                        ? ` · ${t.defaultIntervalDays}d`
                        : ""}
                    </td>
                    <td className="num">{t.defaultDurationMinutes}m</td>
                    <td>
                      <HandoffBadge tone={t.guestDisruptionLevel === "high" ? "danger" : t.guestDisruptionLevel === "medium" ? "warn" : "soft"}>
                        {t.guestDisruptionLevel}
                        {t.requiresVillaEmpty ? " · empty" : ""}
                      </HandoffBadge>
                    </td>
                    <td>
                      <HandoffBadge tone={t.status === "active" ? "ok" : "soft"}>
                        {t.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
                      <TemplateRowActions id={t.id} status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
