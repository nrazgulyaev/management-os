import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { contractGroups, contractMilestones } from "@/lib/db/schema/sales";
import { villas } from "@/lib/db/schema/projects";
import { formatMoneyMinor } from "@/lib/money";
import { MarkPaidButton } from "./_mark-paid-button";

export const metadata: Metadata = { title: "Payments · Buyer Portal" };
export const dynamic = "force-dynamic";

type MilestoneRow = {
  id: string;
  sequence: number;
  name: string;
  status: string;
  expectedAmountUsdMinor: bigint;
  paidAmountUsdMinor: bigint;
  expectedDueDate: string | null;
  paidAt: Date | null;
};

type VillaLadder = {
  villaId: string;
  villaLabel: string;
  villaStatus: string;
  milestones: MilestoneRow[];
};

const STATUS_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  partially_paid: "bg-amber-100 text-amber-800 border-amber-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  invoiced: "bg-stone-100 text-stone-700 border-stone-300",
  pre_invoiced: "bg-stone-100 text-stone-700 border-stone-300",
  pending: "bg-stone-100 text-stone-600 border-stone-300",
  waived: "bg-stone-100 text-stone-500 border-stone-300",
  cancelled: "bg-stone-100 text-stone-500 border-stone-300",
};

const PAYABLE_STATUSES = new Set([
  "pending",
  "pre_invoiced",
  "invoiced",
  "partially_paid",
  "overdue",
]);

export default async function BuyerPaymentsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  // 1. The buyer's assigned villas.
  const assignments = await db
    .select({
      unitId: buyerUnitAssignments.unitId,
      status: buyerUnitAssignments.status,
    })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyer.buyerId));

  const unitIds = assignments.map((a) => a.unitId);

  // Villa display labels (unit code / name) for each assigned villa.
  const villaRows =
    unitIds.length > 0
      ? await db
          .select({
            id: villas.id,
            unitCode: villas.unitCode,
            name: villas.name,
          })
          .from(villas)
          .where(inArray(villas.id, unitIds))
      : [];
  const villaById = new Map(villaRows.map((v) => [v.id, v]));

  // 2. Contract groups for those villas (one ladder source per villa).
  const groups =
    unitIds.length > 0
      ? await db
          .select({ id: contractGroups.id, villaId: contractGroups.villaId })
          .from(contractGroups)
          .where(inArray(contractGroups.villaId, unitIds))
      : [];
  const groupIds = groups.map((g) => g.id);
  const villaIdByGroupId = new Map(groups.map((g) => [g.id, g.villaId]));

  // 3. Milestones for those groups, ordered by sequence (the ladder).
  const milestoneRows =
    groupIds.length > 0
      ? await db
          .select({
            id: contractMilestones.id,
            contractGroupId: contractMilestones.contractGroupId,
            sequence: contractMilestones.sequence,
            name: contractMilestones.name,
            status: contractMilestones.status,
            expectedAmountUsdMinor: contractMilestones.expectedAmountUsdMinor,
            paidAmountUsdMinor: contractMilestones.paidAmountUsdMinor,
            expectedDueDate: contractMilestones.expectedDueDate,
            paidAt: contractMilestones.paidAt,
          })
          .from(contractMilestones)
          .where(inArray(contractMilestones.contractGroupId, groupIds))
          .orderBy(
            asc(contractMilestones.contractGroupId),
            asc(contractMilestones.sequence),
          )
      : [];

  // Group milestones by villa (via group → villa).
  const ladderByVilla = new Map<string, VillaLadder>();
  for (const a of assignments) {
    const v = villaById.get(a.unitId);
    ladderByVilla.set(a.unitId, {
      villaId: a.unitId,
      villaLabel: v?.name ?? v?.unitCode ?? `Villa ${a.unitId.slice(0, 8)}`,
      villaStatus: a.status,
      milestones: [],
    });
  }
  for (const m of milestoneRows) {
    const villaId = villaIdByGroupId.get(m.contractGroupId);
    if (!villaId) continue;
    const ladder = ladderByVilla.get(villaId);
    if (!ladder) continue;
    ladder.milestones.push({
      id: m.id,
      sequence: m.sequence,
      name: m.name,
      status: m.status,
      expectedAmountUsdMinor: m.expectedAmountUsdMinor,
      paidAmountUsdMinor: m.paidAmountUsdMinor,
      expectedDueDate: m.expectedDueDate,
      paidAt: m.paidAt,
    });
  }

  const ladders = [...ladderByVilla.values()];
  const hasAnyMilestones = ladders.some((l) => l.milestones.length > 0);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-stone-900 mb-1">
          Payments
        </h2>
        <p className="text-sm text-stone-600">
          Your installment schedule for each villa you are purchasing. Confirm a
          payment once you have transferred the funds — our team reconciles it
          against the contract.
        </p>
      </section>

      {ladders.length === 0 ? (
        <div className="rounded-lg border border-stone-300 bg-white p-6 text-sm text-stone-600">
          No villas assigned yet.
        </div>
      ) : !hasAnyMilestones ? (
        <div className="rounded-lg border border-stone-300 bg-white p-6 text-sm text-stone-600">
          Your payment schedule has not been issued yet. It appears here once
          your contract milestones are set up.
        </div>
      ) : (
        <div className="space-y-6">
          {ladders.map((ladder) => {
            const expectedTotal = ladder.milestones.reduce(
              (sum, m) => sum + m.expectedAmountUsdMinor,
              0n,
            );
            const paidTotal = ladder.milestones.reduce(
              (sum, m) => sum + m.paidAmountUsdMinor,
              0n,
            );
            return (
              <section
                key={ladder.villaId}
                className="rounded-lg border border-stone-300 bg-white"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4">
                  <div>
                    <h3 className="font-display text-lg tracking-wide text-stone-900">
                      {ladder.villaLabel}
                    </h3>
                    <p className="text-xs text-stone-500 capitalize">
                      {ladder.villaStatus.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-stone-900">
                      {formatMoneyMinor(paidTotal, "USD")} /{" "}
                      {formatMoneyMinor(expectedTotal, "USD")}
                    </div>
                    <div className="text-xs text-stone-500">paid of total</div>
                  </div>
                </header>

                {ladder.milestones.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-stone-500">
                    No installments scheduled yet.
                  </div>
                ) : (
                  <ol className="divide-y divide-stone-200">
                    {ladder.milestones.map((m) => {
                      const pill =
                        STATUS_PILL[m.status] ?? STATUS_PILL.pending;
                      const payable = PAYABLE_STATUSES.has(m.status);
                      return (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-stone-400">
                                {String(m.sequence).padStart(2, "0")}
                              </span>
                              <span className="text-sm text-stone-900">
                                {m.name}
                              </span>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${pill}`}
                              >
                                {m.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-stone-500">
                              {m.expectedDueDate
                                ? `Due ${m.expectedDueDate}`
                                : "No due date"}
                              {m.paidAmountUsdMinor > 0n &&
                                m.status !== "paid" && (
                                  <>
                                    {" · "}
                                    {formatMoneyMinor(
                                      m.paidAmountUsdMinor,
                                      "USD",
                                    )}{" "}
                                    paid so far
                                  </>
                                )}
                              {m.status === "paid" && m.paidAt && (
                                <>
                                  {" · "}paid{" "}
                                  {m.paidAt.toISOString().slice(0, 10)}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm font-mono text-stone-900">
                                {formatMoneyMinor(
                                  m.expectedAmountUsdMinor,
                                  "USD",
                                )}
                              </div>
                            </div>
                            {payable && (
                              <MarkPaidButton milestoneId={m.id} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-stone-400">
        Bank-transfer and local payment rails are coming soon. For now, please
        transfer via the instructions in your contract and confirm here.
      </p>
    </BuyerShell>
  );
}
