"use server";
import "server-only";

/**
 * AI-agents cabinet — operator-triggered "Generate digest".
 *
 * The /digests/new page previously only documented how to trigger the
 * monthly cron. This adapter lets an operator generate a digest on
 * demand: it builds the same DigestContext the cron builds (latest
 * company snapshot, period derived from the chosen digest type), then
 * delegates to generateDigest() — which itself enforces requireOrgId()
 * and stamps organization_id. We never pass a client org.
 */

import { z } from "zod";
import { getLatestCompanySnapshot } from "../executive/metrics-queries";
import { generateDigest } from "./digest-actions";

const inputSchema = z.object({
  digestType: z.enum(["weekly", "monthly", "quarterly", "on_demand"]),
});

type Period = { label: string; start: Date; end: Date };

function periodFor(digestType: z.infer<typeof inputSchema>["digestType"]): Period {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (digestType === "monthly") {
    // The month that just ended (matches the cron).
    const end = new Date(Date.UTC(y, m, 0));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return {
      label: start.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      start,
      end,
    };
  }

  if (digestType === "weekly") {
    // The 7 days ending yesterday (UTC).
    const end = new Date(Date.UTC(y, m, now.getUTCDate() - 1));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return {
      label: `Week ending ${end.toISOString().slice(0, 10)}`,
      start,
      end,
    };
  }

  if (digestType === "quarterly") {
    // The quarter that contains today.
    const qStartMonth = Math.floor(m / 3) * 3;
    const start = new Date(Date.UTC(y, qStartMonth, 1));
    const end = new Date(Date.UTC(y, qStartMonth + 3, 0));
    const q = Math.floor(m / 3) + 1;
    return { label: `Q${q} ${y}`, start, end };
  }

  // on_demand — month-to-date.
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m, now.getUTCDate()));
  return {
    label: `${start.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })} (to date)`,
    start,
    end,
  };
}

export async function generateDigestFromUI(
  input: z.input<typeof inputSchema>,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid digest type",
    };
  }
  const { digestType } = parsed.data;
  const period = periodFor(digestType);

  // getLatestCompanySnapshot is org-scoped internally; missing snapshot
  // yields a zero-filled (still usable) draft, matching the cron.
  const snapshot = await getLatestCompanySnapshot().catch(() => null);

  const result = await generateDigest({
    digestType,
    metricsSnapshotId: snapshot?.id,
    context: {
      periodLabel: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      baseCurrency: "IDR",
      snapshot: {
        totalCashOnHandMinor: snapshot ? Number(snapshot.totalCashOnHandMinor) : 0,
        activeProjectsCount: snapshot?.activeProjectsCount ?? 0,
        projectsOnTrack: snapshot?.projectsOnTrack ?? 0,
        projectsAtRisk: snapshot?.projectsAtRisk ?? 0,
        projectsDelayed: snapshot?.projectsDelayed ?? 0,
        activeLeadsCount: snapshot?.activeLeadsCount ?? 0,
        contractsSignedThisMonth: snapshot?.contractsSignedThisMonth ?? 0,
        totalCommittedCapitalMinor: snapshot
          ? Number(snapshot.totalCommittedCapitalMinor)
          : 0,
        totalDrawnCapitalMinor: snapshot
          ? Number(snapshot.totalDrawnCapitalMinor)
          : 0,
        openQaQcIssues: snapshot?.openQaQcIssues ?? 0,
        criticalQaQcIssues: snapshot?.criticalQaQcIssues ?? 0,
        highRiskItemsCount: snapshot?.highRiskItemsCount ?? 0,
        payrollRunwayWeeks: snapshot?.payrollRunwayWeeks
          ? Number(snapshot.payrollRunwayWeeks)
          : 0,
      },
    },
  });

  return result.ok
    ? { ok: true, code: result.code }
    : { ok: false, error: result.error };
}
