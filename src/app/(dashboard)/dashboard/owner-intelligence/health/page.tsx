import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { NoItemsYet } from "@/components/ui/primitives";
import { requireOrgId } from "@/features/auth/require-org";
import { listOwnerVillaHealthSnapshots } from "@/features/owner-intelligence/health-services";
import { GenerateAllSnapshotsButton } from "@/components/owner-intelligence/snapshot-buttons";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Villa health snapshots" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  excellent: "ok",
  good: "info",
  watch: "warn",
  attention: "danger",
  unknown: "soft",
};

export default async function HealthListPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;
  const snapshots = await listOwnerVillaHealthSnapshots({
    organizationId: await requireOrgId(),
  });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            / <span>Health snapshots</span>
          </div>
          <h1>Villa health snapshots</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Cached health summaries per villa + period. Owners read these
            through the same projection at /owner/villas/[id]/health. Use the
            button below to recompute the current month for every villa with
            prior history.
          </p>
        </div>
        <div className="actions">
          <GenerateAllSnapshotsButton />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">History · {snapshots.length} snapshots</div>
        {snapshots.length === 0 ? (
          <NoItemsYet
            entityLabel="health snapshots"
            description="No villa health snapshots have been generated yet. Use the 'Generate snapshots' button in the page header to seed the current month for every villa with prior history."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Villa</th>
                  <th scope="col">Period</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Booked</th>
                  <th scope="col" className="num">Owner</th>
                  <th scope="col" className="num">Maint</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="mono text-[11px] text-ink-tertiary">
                      {s.villaId.slice(0, 8)}…
                    </td>
                    <td className="mono text-xs">
                      {s.periodStart} → {s.periodEnd}
                    </td>
                    <td className="num mono text-xs">
                      {s.healthScore !== null
                        ? Number(s.healthScore).toFixed(0)
                        : "—"}
                    </td>
                    <td>
                      <HandoffBadge
                        tone={STATUS_TONES[s.healthStatus] ?? "soft"}
                      >
                        {s.healthStatus}
                      </HandoffBadge>
                    </td>
                    <td className="num">
                      {s.bookedNights}
                    </td>
                    <td className="num">
                      {s.ownerStayNights}
                    </td>
                    <td className="num">
                      {s.maintenanceBlockedNights}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/owner-intelligence/health/${s.villaId}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Open
                      </Link>
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
