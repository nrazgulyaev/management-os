import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
  capitalDrawdowns,
  investorWallets,
} from "@/lib/db/schema/investor-capital";
import { requireOrgId } from "@/features/auth/require-org";
import type {
  CommitmentDetail,
  DrawdownListItem,
} from "@/lib/development/types/investors";
import { getCommitments as getCommitmentsList } from "./investors";

export { getCommitments } from "./investors";
export type { CommitmentFilters } from "./investors";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

export async function getCommitment(id: string): Promise<CommitmentDetail | null> {
  const db = getDb();
  if (!db) return null;

  const organizationId = await requireOrgId();

  const list = await getCommitmentsList({});
  const summary = list.find((c) => c.id === id);
  if (!summary) return null;

  const [base] = await db
    .select({
      landownerAssetValueMinor: capitalCommitments.landownerAssetValueMinor,
      landownerAssetCurrency: capitalCommitments.landownerAssetCurrency,
      agreementDocumentId: capitalCommitments.agreementDocumentId,
      notes: capitalCommitments.notes,
      createdAt: capitalCommitments.createdAt,
    })
    .from(capitalCommitments)
    .where(
      and(
        eq(capitalCommitments.id, id),
        eq(capitalCommitments.organizationId, organizationId),
      ),
    )
    .limit(1);
  // Cross-org guard: if the commitment is not in the caller's org the
  // base row is absent — return null so the page notFound()s.
  if (!base) return null;

  const [wallet] = await db
    .select({ id: investorWallets.id })
    .from(investorWallets)
    .where(
      and(
        eq(investorWallets.commitmentId, id),
        eq(investorWallets.organizationId, organizationId),
      ),
    )
    .limit(1);

  const drawdownRows = await db
    .select({
      id: capitalDrawdowns.id,
      drawdownNumber: capitalDrawdowns.drawdownNumber,
      amountMinor: capitalDrawdowns.amountMinor,
      currency: capitalDrawdowns.currency,
      amountUsdMinor: capitalDrawdowns.amountUsdMinor,
      fxRateAtDrawdown: capitalDrawdowns.fxRateAtDrawdown,
      requestedAt: capitalDrawdowns.requestedAt,
      dueDate: capitalDrawdowns.dueDate,
      receivedAt: capitalDrawdowns.receivedAt,
      status: capitalDrawdowns.status,
      triggerReason: capitalDrawdowns.triggerReason,
      paymentMethod: capitalDrawdowns.paymentMethod,
      paymentReference: capitalDrawdowns.paymentReference,
    })
    .from(capitalDrawdowns)
    .where(
      and(
        eq(capitalDrawdowns.commitmentId, id),
        eq(capitalDrawdowns.organizationId, organizationId),
      ),
    )
    .orderBy(capitalDrawdowns.drawdownNumber);

  const drawdowns: DrawdownListItem[] = drawdownRows.map((d) => ({
    id: d.id,
    commitmentId: id,
    commitmentCode: summary.commitmentCode,
    drawdownNumber: d.drawdownNumber,
    amountMinor: toStr(d.amountMinor),
    currency: d.currency as DrawdownListItem["currency"],
    amountUsdMinor: toStr(d.amountUsdMinor),
    fxRateAtDrawdown: toStr(d.fxRateAtDrawdown),
    requestedAt: new Date(d.requestedAt).toISOString(),
    dueDate: String(d.dueDate),
    receivedAt: d.receivedAt ? new Date(d.receivedAt).toISOString() : null,
    status: d.status as DrawdownListItem["status"],
    triggerReason: d.triggerReason as DrawdownListItem["triggerReason"],
    paymentMethod: d.paymentMethod
      ? (d.paymentMethod as DrawdownListItem["paymentMethod"])
      : null,
    paymentReference: d.paymentReference ?? null,
  }));

  return {
    ...summary,
    landownerAssetValueMinor: base?.landownerAssetValueMinor
      ? base.landownerAssetValueMinor.toString()
      : null,
    landownerAssetCurrency: (base?.landownerAssetCurrency ?? null) as
      | CommitmentDetail["landownerAssetCurrency"],
    agreementDocumentId: base?.agreementDocumentId ?? null,
    notes: base?.notes ?? null,
    createdAt: base?.createdAt
      ? new Date(base.createdAt).toISOString()
      : new Date().toISOString(),
    drawdowns,
    walletId: wallet?.id ?? "",
  };
}

export interface CommitmentDrawdownProgress {
  committedUsdMinor: string;
  drawnUsdMinor: string;
  remainingUsdMinor: string;
  drawnPercent: number;
  outstandingDrawdownsCount: number;
  overdueDrawdownsCount: number;
}

export async function getCommitmentDrawdownProgress(
  id: string,
): Promise<CommitmentDrawdownProgress> {
  const db = getDb();
  if (!db) {
    return {
      committedUsdMinor: "0",
      drawnUsdMinor: "0",
      remainingUsdMinor: "0",
      drawnPercent: 0,
      outstandingDrawdownsCount: 0,
      overdueDrawdownsCount: 0,
    };
  }
  const organizationId = await requireOrgId();
  const [row] = await db.execute(sql`
    SELECT
      cc.committed_amount_usd_minor,
      coalesce(sum(d.amount_usd_minor) FILTER (WHERE d.status = 'received'), 0)::bigint
        AS drawn_usd_minor,
      count(*) FILTER (WHERE d.status = 'requested')::int AS outstanding_count,
      count(*) FILTER (WHERE d.status = 'overdue')::int AS overdue_count
    FROM capital_commitments cc
    LEFT JOIN capital_drawdowns d ON d.commitment_id = cc.id
    WHERE cc.id = ${id}
      AND cc.organization_id = ${organizationId}
    GROUP BY cc.committed_amount_usd_minor
  `);
  const r = (row ?? {}) as Record<string, unknown>;
  const committed = BigInt(toStr(r.committed_amount_usd_minor));
  const drawn = BigInt(toStr(r.drawn_usd_minor));
  const remaining = committed > drawn ? committed - drawn : 0n;
  const pct =
    committed > 0n ? Number((drawn * 10000n) / committed) / 100 : 0;
  return {
    committedUsdMinor: committed.toString(),
    drawnUsdMinor: drawn.toString(),
    remainingUsdMinor: remaining.toString(),
    drawnPercent: pct,
    outstandingDrawdownsCount: Number(r.outstanding_count ?? 0),
    overdueDrawdownsCount: Number(r.overdue_count ?? 0),
  };
}
