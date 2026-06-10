import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { taxTypes, taxPeriodReports } from "@/lib/db/schema/tax";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { vendors } from "@/lib/db/schema/site-operations";
import { requireOrgId } from "@/features/auth/require-org";
import { taxDirectionKind } from "@/lib/development/server/tax/tax-kind";

/**
 * ID-TAX compliance trio — e-Faktur export DRAFT loader.
 *
 * Assembles the VAT (PPN) line-level register for one period, org-scoped:
 *   * lines = VAT-classified dev_transactions in the window, split by the
 *     0164 direction mapping (inflow → e-Faktur PPN Keluaran / output,
 *     outflow → PPN Masukan / input; internal transfers excluded) — the
 *     same rows generateTaxPeriodReport aggregates, so block totals match
 *     the declaration totals on the tax-reports page;
 *   * counterparty NPWP comes from the org's vendor register when the
 *     transaction's counterparty_name matches a vendor legal name
 *     (case/whitespace-insensitive) and that vendor has a tax_id. The
 *     stored value is exported VERBATIM — nothing is fabricated;
 *   * declaration header metadata (status / DJP reference) comes from the
 *     period's tax_period_reports rows for the same direction.
 *
 * This is a Coretax import DRAFT — column mapping must be verified against
 * the operator's Coretax template before upload. It is NOT a certified
 * DJP/Coretax file format.
 */

export type EfakturDirection = "output" | "input";

export interface EfakturLine {
  transactionDate: string;
  transactionCode: string;
  counterpartyName: string;
  /** Vendor register tax_id, verbatim, or null when no vendor match. */
  counterpartyNpwp: string | null;
  currency: string;
  /** Original-currency amount, minor units (integer — no decimal guess). */
  amountOriginalMinor: bigint;
  /** USD-normalised base, minor units (matches declaration taxable sum). */
  baseUsdMinor: bigint;
  /** USD-normalised VAT, minor units (matches declaration tax sum). */
  vatUsdMinor: bigint;
  /** dev_transactions.direction: 'inflow' | 'outflow'. */
  transactionDirection: string;
  taxTypeName: string;
}

export interface EfakturDeclarationBlock {
  direction: EfakturDirection;
  /** Mock-parity label: "e-Faktur PPN Keluaran" / "e-Faktur PPN Masukan". */
  label: string;
  /** tax_period_reports status(es) for this direction, or null when none. */
  reportStatus: string | null;
  djpReference: string | null;
  totalBaseUsdMinor: bigint;
  totalVatUsdMinor: bigint;
  lines: EfakturLine[];
}

export interface EfakturExportData {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  /** Display names of the VAT-class tax types included. */
  vatTaxTypeNames: string[];
  blocks: EfakturDeclarationBlock[];
}

const DIRECTION_LABEL: Record<EfakturDirection, string> = {
  output: "e-Faktur PPN Keluaran",
  input: "e-Faktur PPN Masukan",
};

/** 0164 mapping: txn direction → e-Faktur declaration. */
const TXN_TO_DECLARATION: Record<string, EfakturDirection> = {
  inflow: "output",
  outflow: "input",
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export async function loadEfakturExport(
  periodStart: string,
  periodEnd: string,
): Promise<EfakturExportData> {
  const db = requireDb();
  const organizationId = await requireOrgId();

  // VAT-class tax types — same matcher generateTaxPeriodReport uses.
  const allTypes = await db
    .select({
      id: taxTypes.id,
      typeKey: taxTypes.typeKey,
      displayName: taxTypes.displayName,
    })
    .from(taxTypes);
  const vatTypes = allTypes.filter((t) => taxDirectionKind(t) === "vat");
  const vatTypeIds = vatTypes.map((t) => t.id);
  const typeNameById = new Map(vatTypes.map((t) => [t.id, t.displayName]));

  const emptyBlock = (direction: EfakturDirection): EfakturDeclarationBlock => ({
    direction,
    label: DIRECTION_LABEL[direction],
    reportStatus: null,
    djpReference: null,
    totalBaseUsdMinor: 0n,
    totalVatUsdMinor: 0n,
    lines: [],
  });
  const blocks: Record<EfakturDirection, EfakturDeclarationBlock> = {
    output: emptyBlock("output"),
    input: emptyBlock("input"),
  };

  if (vatTypeIds.length === 0) {
    return {
      organizationId,
      periodStart,
      periodEnd,
      vatTaxTypeNames: [],
      blocks: [blocks.output, blocks.input],
    };
  }

  // NPWP lookup: org vendors with a tax_id, keyed by normalized legal name.
  const vendorRows = await db
    .select({ legalName: vendors.legalName, taxId: vendors.taxId })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, organizationId),
        isNotNull(vendors.taxId),
      ),
    );
  const npwpByName = new Map<string, string>();
  for (const v of vendorRows) {
    if (v.taxId) npwpByName.set(normalizeName(v.legalName), v.taxId);
  }

  // The same window generateTaxPeriodReport aggregates; internal transfers
  // are excluded by the direction mapping (only inflow/outflow map).
  const txns = await db
    .select({
      transactionDate: devTransactions.transactionDate,
      transactionCode: devTransactions.transactionCode,
      counterpartyName: devTransactions.counterpartyName,
      currency: devTransactions.currency,
      amountMinor: devTransactions.amountMinor,
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
        inArray(devTransactions.taxTypeId, vatTypeIds),
        inArray(devTransactions.direction, ["inflow", "outflow"]),
      ),
    )
    .orderBy(asc(devTransactions.transactionDate), asc(devTransactions.transactionCode));

  for (const t of txns) {
    const declaration = TXN_TO_DECLARATION[t.direction];
    if (!declaration) continue;
    const block = blocks[declaration];
    const counterpartyName = t.counterpartyName?.trim() ?? "";
    const line: EfakturLine = {
      transactionDate: t.transactionDate,
      transactionCode: t.transactionCode,
      counterpartyName,
      counterpartyNpwp: counterpartyName
        ? (npwpByName.get(normalizeName(counterpartyName)) ?? null)
        : null,
      currency: t.currency,
      amountOriginalMinor: t.amountMinor,
      baseUsdMinor: t.amountUsdMinor,
      vatUsdMinor: t.taxAmountMinor ?? 0n,
      transactionDirection: t.direction,
      taxTypeName: typeNameById.get(t.taxTypeId ?? "") ?? "",
    };
    block.lines.push(line);
    block.totalBaseUsdMinor += line.baseUsdMinor;
    block.totalVatUsdMinor += line.vatUsdMinor;
  }

  // Declaration header metadata from the period's reports (per direction).
  const reports = await db
    .select({
      vatDirection: taxPeriodReports.vatDirection,
      status: taxPeriodReports.status,
      filedAt: taxPeriodReports.filedAt,
      djpReference: taxPeriodReports.djpReference,
    })
    .from(taxPeriodReports)
    .where(
      and(
        eq(taxPeriodReports.organizationId, organizationId),
        eq(taxPeriodReports.periodStart, periodStart),
        eq(taxPeriodReports.periodEnd, periodEnd),
        inArray(taxPeriodReports.taxTypeId, vatTypeIds),
        inArray(taxPeriodReports.vatDirection, ["output", "input"]),
      ),
    );
  for (const direction of ["output", "input"] as const) {
    const matching = reports.filter((r) => r.vatDirection === direction);
    if (matching.length === 0) continue;
    const statuses = [
      ...new Set(matching.map((r) => (r.filedAt ? "filed" : r.status))),
    ];
    blocks[direction].reportStatus = statuses.join(" / ");
    blocks[direction].djpReference =
      matching.find((r) => r.djpReference)?.djpReference ?? null;
  }

  return {
    organizationId,
    periodStart,
    periodEnd,
    vatTaxTypeNames: vatTypes.map((t) => t.displayName),
    blocks: [blocks.output, blocks.input],
  };
}
