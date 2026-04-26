import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
import { listDamageReports } from "@/features/operations/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Operations · Damage reports" };
export const dynamic = "force-dynamic";

export default async function DamageReportsPage() {
  const reports = await listDamageReports({ limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Damage reports" },
        ]}
        title="Damage reports"
        description="Damage logged during cleaning or stays. Drives owner / guest cost allocation."
        actions={
          <Button asChild>
            <Link href="/dashboard/operations/damage-reports/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Log damage
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
        {reports.length === 0 ? (
          <p className="p-6 text-sm text-ink-tertiary">No damage reports yet.</p>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
