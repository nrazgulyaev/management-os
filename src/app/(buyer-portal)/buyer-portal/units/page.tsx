import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { villas } from "@/lib/db/schema/projects";

export const metadata: Metadata = { title: "My villas · Buyer Portal" };
export const dynamic = "force-dynamic";

export default async function BuyerUnitsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  // Scoped to this buyer + portal-visible only (mirrors the detail-page gate).
  const assignments = await db
    .select()
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyer.buyerId),
        eq(buyerUnitAssignments.isVisibleInPortal, true),
      ),
    );

  // Batch villa labels so rows show the real name, not an opaque UUID slice.
  const unitIds = [...new Set(assignments.map((a) => a.unitId))];
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

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          My villas
        </h2>
        <p className="text-sm text-ink-secondary">
          {assignments.length === 0
            ? "No villas assigned yet."
            : `${assignments.length} villa${assignments.length === 1 ? "" : "s"} reserved/contracted in your name.`}
        </p>
      </section>

      <ul className="space-y-3">
        {assignments.map((a) => {
          const v = villaById.get(a.unitId);
          const label =
            v?.name ?? v?.unitCode ?? `Villa ${a.unitId.slice(0, 8)}`;
          return (
          <li
            key={a.id}
            className="rounded-lg border border-line-soft bg-surface p-5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-ink">{label}</div>
                <div className="text-xs text-ink-tertiary capitalize">
                  {v?.unitCode ? `${v.unitCode} · ` : ""}Status:{" "}
                  {a.status.replace(/_/g, " ")}
                </div>
              </div>
              <Link
                href={`/buyer-portal/units/${a.unitId}`}
                className="text-sm text-ink-secondary underline hover:text-ink transition-colors"
              >
                Details
              </Link>
            </div>
            <div className="text-xs text-ink-tertiary">
              Assigned {a.assignedAt}
              {a.contractedAt && ` · contracted ${a.contractedAt}`}
              {a.handedOverAt && ` · handed over ${a.handedOverAt}`}
            </div>
          </li>
          );
        })}
      </ul>
    </BuyerShell>
  );
}
