import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
import { listDamageReports } from "@/features/operations/services";
import { listVillas } from "@/features/villas/services";
import { formatMoneyMinor } from "@/lib/money";
import { DamageAddButton } from "@/components/operations/damage-add-button";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Damage reports" };
export const dynamic = "force-dynamic";

export default async function DamageReportsPage() {
  const [reports, villas] = await Promise.all([
    listDamageReports({ limit: 200 }),
    listVillas(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Damage reports" },
        ]}
        title="Damage reports"
        description="Damage logged during cleaning or stays. Drives owner / guest cost allocation."
        actions={<DamageAddButton villas={villaOpts} />}
      />
      <DbStatusNotice />
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
        {reports.length === 0 ? (
          <NoItemsYet
            entityLabel="damage reports"
            description="Damage spotted during turnovers or stays will appear here for owner / guest charge-back."
            addHref="/dashboard/operations/damage-reports/new"
            addLabel="Log damage"
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {reports.map((r) => (
              <li key={r.id} className="p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="outline">{r.severity}</Badge>
                    <Badge tone="neutral">{r.status.replace(/_/g, " ")}</Badge>
                    {r.ownerChargeable && <Badge tone="warning">Owner chargeable</Badge>}
                    {r.guestChargeable && <Badge tone="danger">Guest chargeable</Badge>}
                  </div>
                  <div className="text-sm text-ink font-medium mt-1">{r.title}</div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    {r.villaCode ?? "—"} · {r.createdAt.slice(0, 10)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                      Estimated
                    </div>
                    <div className="font-mono tabular-nums text-sm text-ink">
                      {r.estimatedCostMinor !== null && r.currency
                        ? formatMoneyMinor(r.estimatedCostMinor, r.currency)
                        : "—"}
                    </div>
                  </div>
                  <OperationsRowActions
                    kind="damage"
                    row={{
                      id: r.id,
                      displayName: r.title,
                      values: {
                        title: r.title,
                        description: r.description ?? "",
                        villaId: r.villaId ?? "",
                        severity: r.severity,
                        estimatedCostMinor:
                          r.estimatedCostMinor != null ? String(r.estimatedCostMinor) : "",
                        currency: r.currency ?? "",
                        ownerChargeable: r.ownerChargeable,
                        guestChargeable: r.guestChargeable,
                      },
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
