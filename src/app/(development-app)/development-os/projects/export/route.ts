import { NextResponse } from "next/server";
import {
  requireInternalUser,
  AuthorizationError,
} from "@/features/auth/permissions";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { computeHealth } from "@/features/projects/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wave-D · projects/page DEAD_END — backs the "Export" button on the
 * projects list. Streams every project the caller's tenant can see as a
 * CSV. Read-only; org scoping is enforced inside getDevelopmentProjects
 * (requireOrgId). Route handlers do NOT inherit the (development-app)
 * layout's enforceProductAccess guard, so we gate requireInternalUser
 * here explicitly — same pattern as the tax-reports / e-Faktur export.
 *
 * Columns mirror the values the card grid renders (budget, burn %,
 * schedule progress, health) so the download matches the screen.
 */

const PHASE_LABEL: Record<string, string> = {
  pre_acquisition: "Pre-acquisition",
  acquisition: "Acquisition",
  design: "Design",
  permitting: "Permitting",
  under_construction: "Under construction",
  fit_out: "Fit-out",
  handover: "Handover",
  managed: "Managed",
  operating: "Operating",
  archived: "Archived",
};

const HEADERS = [
  "code",
  "name",
  "location",
  "phase",
  "currency",
  "units",
  "units_sold",
  "construction_progress_pct",
  "total_budget_minor",
  "budget_used_minor",
  "budget_burn_pct",
  "expected_handover",
  "ai_risk_score",
  "health",
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
  try {
    await requireInternalUser();
  } catch (e) {
    const status = e instanceof AuthorizationError ? 403 : 401;
    return NextResponse.json({ error: "Not authorized." }, { status });
  }

  const projects = await getDevelopmentProjects();

  const lines: string[] = [HEADERS.join(",")];
  for (const p of projects) {
    const budgetUsd = Number(p.budgetUsedMinor) / 100;
    const totalUsd = Number(p.totalBudgetMinor) / 100;
    const budgetPct = totalUsd > 0 ? (budgetUsd / totalUsd) * 100 : 0;

    // Mirror the list page's synthetic single-milestone health read.
    const today = new Date();
    const target = p.expectedHandover ? new Date(p.expectedHandover) : null;
    const slipDays =
      target && target < today
        ? Math.floor(
            (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 0;
    const health = computeHealth({
      milestones: [{ slipDays, status: "in_progress" }],
      budgetTotal: totalUsd,
      budgetActual: budgetUsd,
    }).overall;

    lines.push(
      [
        p.slug.toUpperCase().slice(0, 8),
        p.name,
        p.location,
        PHASE_LABEL[p.phase] ?? p.phase,
        p.currency,
        String(p.units),
        String(p.unitsSold),
        String(p.constructionProgressPct),
        p.totalBudgetMinor.toString(),
        p.budgetUsedMinor.toString(),
        String(Math.round(budgetPct)),
        p.expectedHandover ?? "",
        p.aiRiskScore,
        health,
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
      "Content-Disposition": `attachment; filename="projects-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
