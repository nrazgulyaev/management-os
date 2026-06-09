import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";

export const metadata: Metadata = { title: "My villas · Buyer Portal" };
export const dynamic = "force-dynamic";

export default async function BuyerUnitsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  const assignments = await db
    .select()
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyer.buyerId));

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
        {assignments.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-line-soft bg-surface p-5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-mono text-ink">
                  Villa {a.unitId.slice(0, 8)}
                </div>
                <div className="text-xs text-ink-tertiary capitalize">
                  Status: {a.status.replace(/_/g, " ")}
                </div>
              </div>
              <Link
                href={`/buyer-portal/dashboard`}
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
        ))}
      </ul>
    </BuyerShell>
  );
}
