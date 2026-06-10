import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireInternalUser,
  AuthorizationError,
} from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import {
  loadEfakturExport,
  type EfakturDeclarationBlock,
  type EfakturLine,
} from "@/lib/development/server/tax/efaktur-export";
import { buildCoretaxFakturKeluaranXml } from "@/lib/development/server/tax/coretax-xml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ID-TAX compliance trio — e-Faktur export (download backing the export
 * format picker on the tax-reports page). Two formats:
 *
 *   * format=draft-csv (default) — working DRAFT register: a comment
 *     preamble (draft disclaimer), then per declaration (PPN Keluaran /
 *     PPN Masukan) one `declaration` header row with block totals + report
 *     status, followed by `line` rows from the underlying VAT-classified
 *     dev_transactions. All currencies, USD-normalised aggregates. NOT a
 *     DJP file format.
 *   * format=coretax-xml — official-format Coretax import XML
 *     (TaxInvoiceBulk, faktur pajak keluaran), built per DJP's published
 *     template (docs/CORETAX-EFAKTUR-FORMAT.md). IDR output lines only;
 *     excluded non-IDR lines are counted in the file header comment.
 *
 * Explicitly gated here (route handlers do NOT inherit the layout guard):
 * requireInternalUser + org scoping inside loadEfakturExport. Audited as
 * tax_report.export with the chosen format.
 */

const querySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["draft-csv", "coretax-xml"]).default("draft-csv"),
});

const HEADERS = [
  "row_type",
  "declaration",
  "vat_direction",
  "transaction_date",
  "transaction_code",
  "counterparty_name",
  "counterparty_npwp",
  "currency",
  "amount_original_minor",
  "base_amount_usd",
  "vat_amount_usd",
  "transaction_direction",
  "tax_type",
  "report_status",
  "djp_reference",
] as const;

function csvCell(value: string): string {
  // Quote when the value contains a delimiter, quote, or newline; escape
  // embedded quotes by doubling. Prefix risky leading chars to defang
  // spreadsheet formula injection.
  let v = value ?? "";
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** USD-normalised minor units → decimal string ("1234.56"). */
function usd(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function declarationRow(block: EfakturDeclarationBlock): string[] {
  return [
    "declaration",
    block.label,
    block.direction,
    "",
    "",
    "",
    "",
    "",
    "",
    usd(block.totalBaseUsdMinor),
    usd(block.totalVatUsdMinor),
    "",
    "",
    block.reportStatus ?? "no report generated",
    block.djpReference ?? "",
  ];
}

function lineRow(block: EfakturDeclarationBlock, line: EfakturLine): string[] {
  return [
    "line",
    block.label,
    block.direction,
    line.transactionDate,
    line.transactionCode,
    line.counterpartyName,
    line.counterpartyNpwp ?? "",
    line.currency,
    line.amountOriginalMinor.toString(),
    usd(line.baseUsdMinor),
    usd(line.vatUsdMinor),
    line.transactionDirection,
    line.taxTypeName,
    "",
    "",
  ];
}

export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireInternalUser();
  } catch (e) {
    const status = e instanceof AuthorizationError ? 403 : 401;
    return NextResponse.json({ error: "Not authorized." }, { status });
  }

  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    periodStart: sp.get("periodStart") ?? "",
    periodEnd: sp.get("periodEnd") ?? "",
    format: sp.get("format") ?? "draft-csv",
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "periodStart and periodEnd are required (YYYY-MM-DD); format must be draft-csv or coretax-xml.",
      },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await loadEfakturExport(
      parsed.data.periodStart,
      parsed.data.periodEnd,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed." },
      { status: 500 },
    );
  }

  if (parsed.data.format === "coretax-xml") {
    const result = buildCoretaxFakturKeluaranXml(data);

    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      organizationId: data.organizationId,
      action: "tax_report.export",
      entityType: "tax_period_report",
      entityId: null,
      after: {
        kind: "efaktur_coretax_xml",
        period: `${data.periodStart} → ${data.periodEnd}`,
        includedLineCount: result.includedLineCount,
        excludedNonIdrCount: result.excludedNonIdrCount,
      },
    });

    return new NextResponse(result.xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="coretax-faktur-keluaran-${data.periodStart}_${data.periodEnd}.xml"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const lines: string[] = [
    "# Working DRAFT register — not a DJP/Coretax file format. For the official Coretax import file (faktur keluaran, IDR only) use format=coretax-xml; see docs/CORETAX-EFAKTUR-FORMAT.md.",
    `# e-Faktur VAT register DRAFT (not a certified DJP/Coretax file format) · period ${data.periodStart} → ${data.periodEnd} · VAT tax types: ${data.vatTaxTypeNames.join("; ") || "none configured"}.`,
    "# base_amount_usd / vat_amount_usd are USD-normalised (matching the declaration totals on the tax-reports page); amount_original_minor is the recorded amount in minor units of the stated currency. counterparty_npwp is the vendor register tax_id, verbatim, when the counterparty matches a vendor.",
    HEADERS.join(","),
  ];
  let lineCount = 0;
  for (const block of data.blocks) {
    lines.push(declarationRow(block).map(csvCell).join(","));
    for (const line of block.lines) {
      lines.push(lineRow(block, line).map(csvCell).join(","));
      lineCount += 1;
    }
  }

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    organizationId: data.organizationId,
    action: "tax_report.export",
    entityType: "tax_period_report",
    entityId: null,
    after: {
      kind: "efaktur_csv_draft",
      period: `${data.periodStart} → ${data.periodEnd}`,
      lineCount,
      outputTotalVatUsdMinor: data.blocks[0].totalVatUsdMinor.toString(),
      inputTotalVatUsdMinor: data.blocks[1].totalVatUsdMinor.toString(),
    },
  });

  const csv = lines.join("\r\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="efaktur-draft-${data.periodStart}_${data.periodEnd}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
