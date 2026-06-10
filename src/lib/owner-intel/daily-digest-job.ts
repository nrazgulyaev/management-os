import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownershipShares } from "@/lib/db/schema/ownership";
import { projects, villas } from "@/lib/db/schema/projects";
import { listOwnerIntel, type OwnerIntelRow } from "@/features/owners/owner-intel-service";
import { listOwnerVillaHealthSnapshots } from "@/features/owner-intelligence/health-services";
import type { VillaHealthSnapshot } from "@/lib/db/schema/owner-intelligence";
import { queueNotification } from "@/features/notifications/services";
import { recordAuditEvent } from "@/features/audit/services";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * INSIGHTS-PUSH-0600 — the "Push at 06:00 · new insights" promise from the
 * mgmt-owner-intelligence mock (cc-functional-handoff/cabinets/new/
 * mgmt-owner-intelligence.html §04), made honest.
 *
 * HONESTY BOUNDS: there is no mobile-push infrastructure. "Push" here is
 * the existing ADR-0010 notification spine (`queueNotification` →
 * notification_queue → delivery worker → in-app inbox). Whatever delivery
 * channels the worker supports is what this digest gets.
 *
 * What it does, PER ORG:
 *   1. Owners at churn risk — `listOwnerIntel()` rows whose riskLevel is
 *      `flag` or `watch` (the same read the cabinet renders), attributed
 *      to an org via active ownership_shares (share.organization_id, else
 *      villa → project.organization_id, else project.organization_id).
 *   2. Villas needing attention — latest villa_health_snapshots per villa
 *      whose health_status is `attention` or `watch`, attributed via
 *      snapshot.organization_id, else villa → project.organization_id.
 *   3. Queues ONE digest-style in_app notification per org to the
 *      `director` role (the AR-reminder recipientType="role" pattern),
 *      deduped per org per UTC day. Orgs with nothing to report are
 *      skipped — no noise.
 *
 * Schedule note: Vercel crons are UTC-only (no per-org timezone support),
 * so the vercel.json entry runs at 22:00 UTC, which is 06:00 WITA
 * (Asia/Makassar, UTC+8) — the platform's home timezone. Rows that can't
 * be attributed to any org are counted in metrics, not silently dropped.
 */

export const OWNER_INTEL_DIGEST_TEMPLATE_KEY = "owner_intel_daily_digest";
const DIGEST_RECIPIENT_ROLE = "director";
const DIGEST_HREF = "/dashboard/owner-intelligence";
const TOP_ITEMS = 3;

export function ownerIntelDigestDedupeKey(orgId: string, now: Date = new Date()): string {
  const ymd = now.toISOString().slice(0, 10);
  return `${OWNER_INTEL_DIGEST_TEMPLATE_KEY}:${ymd}:${orgId}`;
}

interface OrgDigest {
  ownersAtRisk: OwnerIntelRow[];
  villasAtRisk: { snapshot: VillaHealthSnapshot; unitCode: string }[];
}

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const RISK_ORDER: Record<OwnerIntelRow["riskLevel"], number> = { flag: 0, watch: 1, ok: 2 };

function renderBody(digest: OrgDigest): string {
  const lines: string[] = [];

  const flagged = digest.ownersAtRisk.filter((o) => o.riskLevel === "flag").length;
  const onWatch = digest.ownersAtRisk.length - flagged;
  if (digest.ownersAtRisk.length > 0) {
    lines.push(
      `Owners at churn risk: ${digest.ownersAtRisk.length} (${flagged} flagged, ${onWatch} on watch)`,
    );
    for (const o of digest.ownersAtRisk.slice(0, TOP_ITEMS)) {
      lines.push(
        `  · ${o.displayName} — ${o.riskLevel === "flag" ? "flagged" : "on watch"}, ${o.riskSignalCount} signal${o.riskSignalCount === 1 ? "" : "s"}`,
      );
    }
  }

  const attention = digest.villasAtRisk.filter(
    (v) => v.snapshot.healthStatus === "attention",
  ).length;
  const villaWatch = digest.villasAtRisk.length - attention;
  if (digest.villasAtRisk.length > 0) {
    lines.push(
      `Villas needing attention: ${digest.villasAtRisk.length} (${attention} attention, ${villaWatch} on watch)`,
    );
    for (const v of digest.villasAtRisk.slice(0, TOP_ITEMS)) {
      const score = num(v.snapshot.healthScore);
      lines.push(
        `  · ${v.unitCode} — ${v.snapshot.healthStatus}${score !== null ? `, ${score.toFixed(0)}/100` : ""}`,
      );
    }
  }

  lines.push(`Open Owner intelligence for the full picture: ${DIGEST_HREF}`);
  return lines.join("\n");
}

export async function runOwnerIntelDailyDigestJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { orgsWithInsights: 0, queued: 0, suppressed: 0 },
      error: "DB unavailable",
    };
  }

  // ------------------------------------------------------------------ //
  // 1. Reads — reuse the cabinet's own services + org-attribution maps. //
  // ------------------------------------------------------------------ //
  const [ownerRows, snapshots, villaRows, projectRows, shareRows] = await Promise.all([
    listOwnerIntel().catch(() => [] as Awaited<ReturnType<typeof listOwnerIntel>>),
    listOwnerVillaHealthSnapshots(),
    db
      .select({
        id: villas.id,
        unitCode: villas.unitCode,
        organizationId: projects.organizationId,
      })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId)),
    db.select({ id: projects.id, organizationId: projects.organizationId }).from(projects),
    db
      .select({
        ownerId: ownershipShares.ownerId,
        organizationId: ownershipShares.organizationId,
        villaId: ownershipShares.villaId,
        projectId: ownershipShares.projectId,
      })
      .from(ownershipShares)
      .where(eq(ownershipShares.status, "active")),
  ]);

  const villaOrg = new Map(villaRows.map((v) => [v.id, v.organizationId]));
  const villaCode = new Map(villaRows.map((v) => [v.id, v.unitCode]));
  const projectOrg = new Map(projectRows.map((p) => [p.id, p.organizationId]));

  // owner → set of org ids (an owner's shares may span orgs).
  const ownerOrgs = new Map<string, Set<string>>();
  for (const s of shareRows) {
    const orgId =
      s.organizationId ??
      (s.villaId ? villaOrg.get(s.villaId) ?? null : null) ??
      (s.projectId ? projectOrg.get(s.projectId) ?? null : null);
    if (!orgId) continue;
    const set = ownerOrgs.get(s.ownerId) ?? new Set<string>();
    set.add(orgId);
    ownerOrgs.set(s.ownerId, set);
  }

  // ------------------------------------------------------------------ //
  // 2. Bucket the morning insight set per org.                          //
  // ------------------------------------------------------------------ //
  const byOrg = new Map<string, OrgDigest>();
  const orgDigest = (orgId: string): OrgDigest => {
    const existing = byOrg.get(orgId);
    if (existing) return existing;
    const fresh: OrgDigest = { ownersAtRisk: [], villasAtRisk: [] };
    byOrg.set(orgId, fresh);
    return fresh;
  };

  let unattributedOwners = 0;
  const atRiskOwners = ownerRows
    .filter((o) => o.riskLevel !== "ok")
    .sort(
      (a, b) =>
        RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] ||
        b.riskSignalCount - a.riskSignalCount,
    );
  for (const o of atRiskOwners) {
    const orgs = ownerOrgs.get(o.id);
    if (!orgs || orgs.size === 0) {
      unattributedOwners += 1;
      continue;
    }
    for (const orgId of orgs) orgDigest(orgId).ownersAtRisk.push(o);
  }

  // Latest snapshot per villa (rows arrive newest-first), attention/watch only.
  const latest = new Map<string, VillaHealthSnapshot>();
  for (const s of snapshots) if (!latest.has(s.villaId)) latest.set(s.villaId, s);
  let unattributedVillas = 0;
  const attentionSnaps = [...latest.values()]
    .filter((s) => s.healthStatus === "attention" || s.healthStatus === "watch")
    .sort((a, b) => {
      if (a.healthStatus !== b.healthStatus) return a.healthStatus === "attention" ? -1 : 1;
      return (num(a.healthScore) ?? 101) - (num(b.healthScore) ?? 101);
    });
  for (const s of attentionSnaps) {
    const orgId = s.organizationId ?? villaOrg.get(s.villaId) ?? null;
    if (!orgId) {
      unattributedVillas += 1;
      continue;
    }
    orgDigest(orgId).villasAtRisk.push({
      snapshot: s,
      unitCode: villaCode.get(s.villaId) ?? s.villaId.slice(0, 8),
    });
  }

  await handle.event("info", "Morning insight set computed", {
    orgsWithInsights: byOrg.size,
    ownersAtRisk: atRiskOwners.length,
    villasNeedingAttention: attentionSnaps.length,
    unattributedOwners,
    unattributedVillas,
  });

  // ------------------------------------------------------------------ //
  // 3. Queue ONE in-app digest per org (deduped per org per UTC day).   //
  //    Orgs with nothing to report never reach this loop — no noise.    //
  // ------------------------------------------------------------------ //
  let queued = 0;
  let suppressed = 0;
  for (const [orgId, digest] of byOrg) {
    const flagged = digest.ownersAtRisk.filter((o) => o.riskLevel === "flag").length;
    const attention = digest.villasAtRisk.filter(
      (v) => v.snapshot.healthStatus === "attention",
    ).length;

    const parts: string[] = [];
    if (digest.ownersAtRisk.length > 0) {
      parts.push(
        `${digest.ownersAtRisk.length} owner${digest.ownersAtRisk.length === 1 ? "" : "s"} at churn risk`,
      );
    }
    if (digest.villasAtRisk.length > 0) {
      parts.push(
        `${digest.villasAtRisk.length} villa${digest.villasAtRisk.length === 1 ? "" : "s"} need attention`,
      );
    }

    const result = await queueNotification({
      recipientType: "role",
      organizationId: orgId,
      channel: "in_app",
      templateKey: OWNER_INTEL_DIGEST_TEMPLATE_KEY,
      title: `Morning insights · ${parts.join(" · ")}`,
      body: renderBody(digest),
      payload: {
        recipientRole: DIGEST_RECIPIENT_ROLE,
        href: DIGEST_HREF,
        organizationId: orgId,
        ownersAtRisk: digest.ownersAtRisk.length,
        ownersFlagged: flagged,
        villasNeedingAttention: digest.villasAtRisk.length,
        villasAttention: attention,
        topOwners: digest.ownersAtRisk.slice(0, TOP_ITEMS).map((o) => ({
          id: o.id,
          displayName: o.displayName,
          riskLevel: o.riskLevel,
          riskSignalCount: o.riskSignalCount,
        })),
        topVillas: digest.villasAtRisk.slice(0, TOP_ITEMS).map((v) => ({
          villaId: v.snapshot.villaId,
          unitCode: v.unitCode,
          healthStatus: v.snapshot.healthStatus,
          healthScore: num(v.snapshot.healthScore),
        })),
      },
      priority: flagged > 0 || attention > 0 ? "high" : "normal",
      dedupeKey: ownerIntelDigestDedupeKey(orgId),
    });
    if (!result) continue;
    if (result.status === "queued") queued += 1;
    else suppressed += 1;
  }

  const metrics = {
    orgsWithInsights: byOrg.size,
    queued,
    suppressed,
    ownersAtRisk: atRiskOwners.length,
    villasNeedingAttention: attentionSnaps.length,
    unattributedOwners,
    unattributedVillas,
  };

  await recordAuditEvent({
    actorUserId: null,
    action: "owner_intel.daily_digest.run",
    entityType: "job_run",
    entityId: handle.id,
    after: metrics,
  });

  if (byOrg.size === 0) {
    return {
      status: "success",
      summary: "No insights to push — no owners at churn risk, no villas needing attention",
      metrics,
    };
  }

  return {
    status: "success",
    summary: `Queued ${queued} org digest${queued === 1 ? "" : "s"} (${suppressed} suppressed as already sent today)`,
    metrics,
  };
}
