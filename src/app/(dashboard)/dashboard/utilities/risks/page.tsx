import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listMaintenanceRiskEvents } from "@/features/maintenance-intelligence/services";
import { RiskRowActions } from "@/components/maintenance-intelligence/risk-row-actions";
import { ScanRisksButton } from "@/components/maintenance-intelligence/scan-risks-button";

export const metadata = { title: "Utility risks" };
export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  low: "soft",
  medium: "info",
  high: "warn",
  critical: "danger",
};

export default async function UtilityRisksPage() {
  const all = await listMaintenanceRiskEvents({ status: "open", limit: 500 });
  const rows = all.filter(
    (r) =>
      r.riskType === "utility_low_balance" ||
      r.riskType === "utility_critical_balance" ||
      r.riskType === "no_recent_reading",
  );
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <span>Risks</span>
          </div>
          <h1>Utility risks</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Open risks scoped to utility accounts: low/critical balance + no recent reading. Run the unified scanner to refresh.
          </p>
        </div>
        <div className="actions">
          <ScanRisksButton />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Open</div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No open utility risks.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HandoffBadge tone={SEVERITY_TONES[r.severity] ?? "soft"}>
                        {r.severity}
                      </HandoffBadge>
                      <span className="font-mono text-[11px] text-ink-tertiary">
                        {r.riskType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-sm text-ink font-medium mt-1.5">
                      {r.title}
                    </div>
                    {r.description && (
                      <div className="text-xs text-ink-tertiary mt-1">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <RiskRowActions id={r.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
