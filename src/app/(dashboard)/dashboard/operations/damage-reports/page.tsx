import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listDamageReports } from "@/features/operations/services";
import { listVillas } from "@/features/villas/services";
import { formatMoneyMinor } from "@/lib/money";
import { DamageAddButton } from "@/components/operations/damage-add-button";
import { DamageStatusActions } from "@/components/operations/damage-status-actions";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <span>Damage reports</span>
          </div>
          <h1>Damage reports</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Damage logged during cleaning or stays. Drives owner / guest cost allocation.
          </p>
        </div>
        <div className="actions">
          <DamageAddButton villas={villaOpts} />
        </div>
      </div>
      <DbStatusNotice />
      <Card padding="none" overflowHidden>
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
                    <HandoffBadge tone="soft">{r.severity}</HandoffBadge>
                    <HandoffBadge tone="ink">{r.status.replace(/_/g, " ")}</HandoffBadge>
                    {r.ownerChargeable && <HandoffBadge tone="warn">Owner chargeable</HandoffBadge>}
                    {r.guestChargeable && <HandoffBadge tone="danger">Guest chargeable</HandoffBadge>}
                  </div>
                  <div className="text-sm text-ink font-medium mt-1">{r.title}</div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    {r.villaCode ?? "—"} · {r.createdAt.slice(0, 10)}
                  </div>
                  <div className="mt-3">
                    <DamageStatusActions
                      id={r.id}
                      status={r.status}
                      currency={r.currency}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                      {r.actualCostMinor !== null ? "Actual" : "Estimated"}
                    </div>
                    <div className="font-mono tabular-nums text-sm text-ink">
                      {r.actualCostMinor !== null && r.currency
                        ? formatMoneyMinor(r.actualCostMinor, r.currency)
                        : r.estimatedCostMinor !== null && r.currency
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
      </Card>
    </div>
  );
}
