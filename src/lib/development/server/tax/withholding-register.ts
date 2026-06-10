import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { taxTypes } from "@/lib/db/schema/tax";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { requireOrgId } from "@/features/auth/require-org";
import { taxDirectionKind } from "@/lib/development/server/tax/tax-kind";

/**
 * ID-TAX compliance trio — bukti potong SOURCE register (read-only).
 *
 * PPh-withholding per counterparty for one period, org-scoped: groups the
 * PPh-classified dev_transactions (same withholding-kind matcher report
 * generation uses; ALL directions, exactly like the e-Bupot declaration
 * aggregation) by counterparty_name into gross base / withheld / count,
 * plus a per-counterparty line detail for the printable draft view.
 *
 * This register is the SOURCE for bukti potong — official e-Bupot
 * certificate numbers are issued by DJP/Coretax and are never invented
 * here. No writes, no migration.
 */

export interface WithholdingCounterpartyRow {
  /** Trimmed counterparty_name; "" groups the no-counterparty rows. */
  counterpartyName: string;
  grossBaseUsdMinor: bigint;
  withheldUsdMinor: bigint;
  transactionCount: number;
}

export interface WithholdingDetailLine {
  transactionDate: string;
  transactionCode: string;
  description: string;
  taxTypeName: string;
  grossBaseUsdMinor: bigint;
  withheldUsdMinor: bigint;
  direction: string;
}

export interface WithholdingRegisterData {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  /** Display names of the withholding-class (PPh) tax types included. */
  pphTaxTypeNames: string[];
  rows: WithholdingCounterpartyRow[];
  totalGrossBaseUsdMinor: bigint;
  totalWithheldUsdMinor: bigint;
}

interface PphTypeSet {
  ids: string[];
  names: string[];
  nameById: Map<string, string>;
}

async function loadPphTypes(
  db: ReturnType<typeof requireDb>,
): Promise<PphTypeSet> {
  const allTypes = await db
    .select({
      id: taxTypes.id,
      typeKey: taxTypes.typeKey,
      displayName: taxTypes.displayName,
    })
    .from(taxTypes);
  const pph = allTypes.filter((t) => taxDirectionKind(t) === "withholding");
  return {
    ids: pph.map((t) => t.id),
    names: pph.map((t) => t.displayName),
    nameById: new Map(pph.map((t) => [t.id, t.displayName])),
  };
}

export async function loadWithholdingRegister(
  periodStart: string,
  periodEnd: string,
): Promise<WithholdingRegisterData> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const pph = await loadPphTypes(db);

  const base: WithholdingRegisterData = {
    organizationId,
    periodStart,
    periodEnd,
    pphTaxTypeNames: pph.names,
    rows: [],
    totalGrossBaseUsdMinor: 0n,
    totalWithheldUsdMinor: 0n,
  };
  if (pph.ids.length === 0) return base;

  const txns = await db
    .select({
      counterpartyName: devTransactions.counterpartyName,
      amountUsdMinor: devTransactions.amountUsdMinor,
      taxAmountMinor: devTransactions.taxAmountMinor,
    })
    .from(devTransactions)
    .where(
      and(
        eq(devTransactions.organizationId, organizationId),
        gte(devTransactions.transactionDate, periodStart),
        lte(devTransactions.transactionDate, periodEnd),
        inArray(devTransactions.taxTypeId, pph.ids),
      ),
    );

  const byName = new Map<string, WithholdingCounterpartyRow>();
  for (const t of txns) {
    const name = t.counterpartyName?.trim() ?? "";
    const row = byName.get(name) ?? {
      counterpartyName: name,
      grossBaseUsdMinor: 0n,
      withheldUsdMinor: 0n,
      transactionCount: 0,
    };
    row.grossBaseUsdMinor += t.amountUsdMinor;
    row.withheldUsdMinor += t.taxAmountMinor ?? 0n;
    row.transactionCount += 1;
    byName.set(name, row);
    base.totalGrossBaseUsdMinor += t.amountUsdMinor;
    base.totalWithheldUsdMinor += t.taxAmountMinor ?? 0n;
  }

  base.rows = [...byName.values()].sort((a, b) =>
    a.withheldUsdMinor === b.withheldUsdMinor
      ? a.counterpartyName.localeCompare(b.counterpartyName)
      : a.withheldUsdMinor > b.withheldUsdMinor
        ? -1
        : 1,
  );
  return base;
}

export interface WithholdingCounterpartyDetail {
  counterpartyName: string;
  periodStart: string;
  periodEnd: string;
  lines: WithholdingDetailLine[];
  totalGrossBaseUsdMinor: bigint;
  totalWithheldUsdMinor: bigint;
}

/**
 * Line detail for ONE counterparty (the printable bukti potong draft).
 * `counterpartyName` is matched on the trimmed value; pass "" for the
 * no-counterparty bucket.
 */
export async function loadWithholdingCounterpartyDetail(
  periodStart: string,
  periodEnd: string,
  counterpartyName: string,
): Promise<WithholdingCounterpartyDetail> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const pph = await loadPphTypes(db);

  const detail: WithholdingCounterpartyDetail = {
    counterpartyName: counterpartyName.trim(),
    periodStart,
    periodEnd,
    lines: [],
    totalGrossBaseUsdMinor: 0n,
    totalWithheldUsdMinor: 0n,
  };
  if (pph.ids.length === 0) return detail;

  const txns = await db
    .select({
      transactionDate: devTransactions.transactionDate,
      transactionCode: devTransactions.transactionCode,
      description: devTransactions.description,
      counterpartyName: devTransactions.counterpartyName,
      amountUsdMinor: devTransactions.amountUsdMinor,
      taxAmountMinor: devTransactions.taxAmountMinor,
      direction: devTransactions.direction,
      taxTypeId: devTransactions.taxTypeId,
    })
    .from(devTransactions)
    .where(
      and(
        eq(devTransactions.organizationId, organizationId),
        gte(devTransactions.transactionDate, periodStart),
        lte(devTransactions.transactionDate, periodEnd),
        inArray(devTransactions.taxTypeId, pph.ids),
      ),
    )
    .orderBy(
      asc(devTransactions.transactionDate),
      asc(devTransactions.transactionCode),
    );

  for (const t of txns) {
    if ((t.counterpartyName?.trim() ?? "") !== detail.counterpartyName) {
      continue;
    }
    detail.lines.push({
      transactionDate: t.transactionDate,
      transactionCode: t.transactionCode,
      description: t.description,
      taxTypeName: pph.nameById.get(t.taxTypeId ?? "") ?? "",
      grossBaseUsdMinor: t.amountUsdMinor,
      withheldUsdMinor: t.taxAmountMinor ?? 0n,
      direction: t.direction,
    });
    detail.totalGrossBaseUsdMinor += t.amountUsdMinor;
    detail.totalWithheldUsdMinor += t.taxAmountMinor ?? 0n;
  }
  return detail;
}
