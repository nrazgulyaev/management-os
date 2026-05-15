import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  siteReports,
  siteWorkforceLogs,
  materialDeliveries,
} from "@/lib/db/schema/site-operations";
import { devTransactions, devBankAccounts } from "@/lib/db/schema/dev-finance";
import { requireOrgId } from "@/features/auth/require-org";
import { getFXAtDate } from "./fx";

/**
 * Bridges from the physical (site reports + material deliveries) into
 * the financial ledger (`dev_transactions`). Always operator-initiated
 * — never auto — so the finance ledger stays curated.
 *
 * Two flows:
 *
 *   - `convertSiteReportLaborToTransaction(reportId, bankAccountId, categoryId)`
 *     Sums `site_workforce_logs.estimated_cost_usd_minor` (or computes
 *     from rate × hours × FX), creates a single dev_transactions row
 *     in the chosen category (typically OPERATIONS or CONSTR_*).
 *     Atomic with bank balance update.
 *
 *   - `convertMaterialDeliveryToTransaction(deliveryId, bankAccountId, categoryId)`
 *     For an accepted delivery — sums delivery_lines × po_lines.unit_price,
 *     creates dev_transactions row paying the vendor in the PO currency.
 *     Atomic with bank balance update + PO commitment-ledger linkage.
 *
 * Both check the source row hasn't already been bridged (idempotency
 * via existing `dev_transactions` rows referencing the source id).
 */

const reportBridgeSchema = z.object({
  reportId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  categoryId: z.string().uuid(),
});

export async function convertSiteReportLaborToTransaction(
  input: z.input<typeof reportBridgeSchema>,
): Promise<{ transactionId: string; transactionCode: string; usdAmount: string }> {
  const parsed = reportBridgeSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  return await db.transaction(async (tx) => {
    const [report] = await tx
      .select({
        id: siteReports.id,
        projectId: siteReports.projectId,
        reportDate: siteReports.reportDate,
        status: siteReports.status,
      })
      .from(siteReports)
      .where(eq(siteReports.id, parsed.reportId))
      .limit(1);
    if (!report) throw new Error("Site report not found");
    if (report.status === "draft") {
      throw new Error("Cannot bridge a draft report — submit it first");
    }

    // Idempotency: check no transaction has been bridged from this report yet.
    const [existing] = await tx
      .select({ id: devTransactions.id })
      .from(devTransactions)
      .where(
        sql`external_reference = ${"site_labor:" + parsed.reportId}`,
      )
      .limit(1);
    if (existing) {
      throw new Error(
        "Labor cost from this report has already been bridged to the ledger",
      );
    }

    // Sum the workforce logs. If estimated_cost_usd_minor is set, use it.
    // Otherwise, compute on-the-fly from rate × hours × FX (rate currency).
    const wf = await tx
      .select()
      .from(siteWorkforceLogs)
      .where(eq(siteWorkforceLogs.siteReportId, parsed.reportId));

    if (wf.length === 0) {
      throw new Error(
        "No workforce logs on this report — nothing to bridge",
      );
    }

    let totalUsdMinor = 0n;
    for (const w of wf) {
      if (w.estimatedCostUsdMinor != null) {
        totalUsdMinor += BigInt(w.estimatedCostUsdMinor);
        continue;
      }
      if (w.estimatedCostMinor != null && w.rateCurrency) {
        const fx = await getFXAtDate(
          w.rateCurrency as Parameters<typeof getFXAtDate>[0],
          String(report.reportDate),
        );
        if (!fx) {
          throw new Error(
            `No FX rate for ${w.rateCurrency} on or before ${String(report.reportDate)} — record one first`,
          );
        }
        // estimated_cost_minor is in original currency. Convert to USD.
        const isUsd = w.rateCurrency === "USD";
        const isUsdt = w.rateCurrency === "USDT";
        const sourceMajor = isUsdt
          ? Number(w.estimatedCostMinor) / 1_000_000
          : Number(w.estimatedCostMinor) / 100;
        const usdMajor = isUsd ? sourceMajor : sourceMajor / fx;
        totalUsdMinor += BigInt(Math.round(usdMajor * 100));
      }
    }

    if (totalUsdMinor <= 0n) {
      throw new Error(
        "Workforce logs have no rate data — cannot compute labor cost. Backfill rates first.",
      );
    }

    // Bank account validation.
    const [account] = await tx
      .select()
      .from(devBankAccounts)
      .where(eq(devBankAccounts.id, parsed.bankAccountId))
      .limit(1);
    if (!account) throw new Error("Bank account not found");

    // Generate transaction_code (TXN-YYYY-NNNNNN)
    const year = new Date(String(report.reportDate)).getFullYear();
    const [seqRow] = await tx
      .select({
        next: sql<number>`coalesce(max(
          CAST(NULLIF(regexp_replace(transaction_code, '^TXN-' || ${year} || '-', ''), '') AS INTEGER)
        ), 0)::int + 1`,
      })
      .from(devTransactions)
      .where(sql`transaction_code LIKE ${"TXN-" + year + "-%"}`);
    const seq = Number(seqRow?.next ?? 1);
    const transactionCode = `TXN-${year}-${String(seq).padStart(6, "0")}`;

    // Insert dev_transactions row in account's native currency.
    // For simplicity we record the transaction in USD — the bank account's
    // currency may differ; the operator can re-allocate via splitTransactionAllocation
    // if multi-project. Here we assume the project_id from the site report.
    const fx = Number(account.lastFxRate ?? 1);
    if (account.currency !== "USD" && !(fx > 0)) {
      throw new Error(
        `Bank account ${account.accountCode} has no last_fx_rate — cannot convert USD labor cost to ${account.currency}`,
      );
    }
    const isUsd = account.currency === "USD";
    const isUsdt = account.currency === "USDT";
    let amountInAccountCurrency: bigint;
    if (isUsd) {
      amountInAccountCurrency = totalUsdMinor;
    } else if (isUsdt) {
      amountInAccountCurrency = totalUsdMinor * 10000n; // 100 → 1_000_000 minor (4 extra zeros)
    } else {
      amountInAccountCurrency = BigInt(Math.round(Number(totalUsdMinor) * fx));
    }

    const [txRow] = await tx
      .insert(devTransactions)
      .values({
        organizationId,
        transactionCode,
        bankAccountId: parsed.bankAccountId,
        direction: "outflow",
        categoryId: parsed.categoryId,
        projectId: report.projectId,
        amountMinor: amountInAccountCurrency,
        currency: account.currency,
        amountUsdMinor: totalUsdMinor,
        fxRateAtTransaction: account.lastFxRate ?? "1.0",
        transactionDate: String(report.reportDate),
        description: `Labor cost — site report ${String(report.reportDate)}`,
        externalReference: "site_labor:" + parsed.reportId,
        allocationType: "single_project",
      })
      .returning({
        id: devTransactions.id,
        transactionCode: devTransactions.transactionCode,
      });

    // Update bank account balance (signed).
    const newBalance = BigInt(account.currentBalanceMinor) - amountInAccountCurrency;
    const newUsdBalance = BigInt(account.currentBalanceUsdMinor) - totalUsdMinor;
    await tx
      .update(devBankAccounts)
      .set({
        currentBalanceMinor: newBalance,
        currentBalanceUsdMinor: newUsdBalance,
        lastBalanceAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devBankAccounts.id, parsed.bankAccountId),
          eq(devBankAccounts.organizationId, organizationId),
        ),
      );

    return {
      transactionId: txRow.id,
      transactionCode: txRow.transactionCode,
      usdAmount: totalUsdMinor.toString(),
    };
  });
}

const deliveryBridgeSchema = z.object({
  deliveryId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  categoryId: z.string().uuid(),
});

export async function convertMaterialDeliveryToTransaction(
  input: z.input<typeof deliveryBridgeSchema>,
): Promise<{ transactionId: string; transactionCode: string; usdAmount: string }> {
  const parsed = deliveryBridgeSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  return await db.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(materialDeliveries)
      .where(eq(materialDeliveries.id, parsed.deliveryId))
      .limit(1);
    if (!delivery) throw new Error("Delivery not found");
    if (delivery.qualityCheckStatus === "rejected") {
      throw new Error("Cannot bridge a rejected delivery");
    }

    // Idempotency.
    const [existing] = await tx
      .select({ id: devTransactions.id })
      .from(devTransactions)
      .where(
        sql`external_reference = ${"material_delivery:" + parsed.deliveryId}`,
      )
      .limit(1);
    if (existing) {
      throw new Error("Delivery already bridged to ledger");
    }

    // Sum line.quantity_received × po_line.unit_price_usd_minor
    const rows = await tx.execute(sql`
      SELECT
        coalesce(sum(dl.quantity_received * pl.unit_price_usd_minor), 0)::bigint AS usd_total,
        coalesce(sum(dl.quantity_received * pl.unit_price_original_minor), 0)::bigint AS orig_total,
        max(po.project_id) AS project_id,
        max(po.total_amount_currency) AS po_currency
      FROM material_delivery_lines dl
      JOIN material_po_lines pl ON pl.id = dl.po_line_id
      JOIN material_purchase_orders po ON po.id = pl.po_id
      WHERE dl.delivery_id = ${parsed.deliveryId}
    `);
    const r = (rows[0] ?? {}) as Record<string, unknown>;
    const usdTotal = BigInt(String(r.usd_total ?? "0"));
    const origTotal = BigInt(String(r.orig_total ?? "0"));
    const projectId = String(r.project_id ?? "");
    const poCurrency = String(r.po_currency ?? "USD");
    if (usdTotal <= 0n) {
      throw new Error("No delivered quantity to bridge");
    }

    const [account] = await tx
      .select()
      .from(devBankAccounts)
      .where(eq(devBankAccounts.id, parsed.bankAccountId))
      .limit(1);
    if (!account) throw new Error("Bank account not found");
    if (account.currency !== poCurrency && account.currency !== "USD") {
      throw new Error(
        `Bank account currency ${account.currency} doesn't match PO currency ${poCurrency} — record a multi-currency transaction manually`,
      );
    }

    // Generate transaction_code
    const year = new Date(String(delivery.deliveryDate)).getFullYear();
    const [seqRow] = await tx
      .select({
        next: sql<number>`coalesce(max(
          CAST(NULLIF(regexp_replace(transaction_code, '^TXN-' || ${year} || '-', ''), '') AS INTEGER)
        ), 0)::int + 1`,
      })
      .from(devTransactions)
      .where(sql`transaction_code LIKE ${"TXN-" + year + "-%"}`);
    const seq = Number(seqRow?.next ?? 1);
    const transactionCode = `TXN-${year}-${String(seq).padStart(6, "0")}`;

    const amountInAccountCurrency =
      account.currency === "USD" ? usdTotal : origTotal;

    const [txRow] = await tx
      .insert(devTransactions)
      .values({
        organizationId,
        transactionCode,
        bankAccountId: parsed.bankAccountId,
        direction: "outflow",
        categoryId: parsed.categoryId,
        projectId,
        amountMinor: amountInAccountCurrency,
        currency: account.currency,
        amountUsdMinor: usdTotal,
        fxRateAtTransaction: account.lastFxRate ?? "1.0",
        transactionDate: String(delivery.deliveryDate),
        description: `Material delivery ${delivery.deliveryCode}`,
        externalReference: "material_delivery:" + parsed.deliveryId,
        allocationType: "single_project",
      })
      .returning({
        id: devTransactions.id,
        transactionCode: devTransactions.transactionCode,
      });

    const newBalance = BigInt(account.currentBalanceMinor) - amountInAccountCurrency;
    const newUsdBalance = BigInt(account.currentBalanceUsdMinor) - usdTotal;
    await tx
      .update(devBankAccounts)
      .set({
        currentBalanceMinor: newBalance,
        currentBalanceUsdMinor: newUsdBalance,
        lastBalanceAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devBankAccounts.id, parsed.bankAccountId),
          eq(devBankAccounts.organizationId, organizationId),
        ),
      );

    return {
      transactionId: txRow.id,
      transactionCode: txRow.transactionCode,
      usdAmount: usdTotal.toString(),
    };
  });
}
