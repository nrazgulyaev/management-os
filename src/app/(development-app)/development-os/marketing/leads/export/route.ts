import { NextResponse } from "next/server";
import { loadLeadsForExport } from "@/lib/development/server/marketing/lead-export-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * design-live gap plan · P1 — "Export leads" CSV download backing the
 * marketing summary cabinet button. Lives under the (development-app)
 * route group, so the layout's enforceProductAccess("dev") guard already
 * gates access. Read-only; streams every lead the caller's tenant can see.
 */

const HEADERS = [
  "lead_code",
  "lifecycle_status",
  "lead_source_key",
  "source_label",
  "campaign_code",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "estimated_value_minor",
  "currency",
  "created_at",
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

export async function GET() {
  const rows = await loadLeadsForExport();

  const lines: string[] = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.leadCode,
        r.lifecycleStatus,
        r.leadSourceKey,
        r.sourceLabel,
        r.campaignCode,
        r.utmSource,
        r.utmMedium,
        r.utmCampaign,
        r.estimatedValueMinor,
        r.currency,
        r.createdAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
