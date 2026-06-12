import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { owners, ownershipShares } from "@/lib/db/schema/ownership";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { mockOwners } from "@/lib/mock/owners";
import type { WithSource } from "@/features/types";
import type { OwnerTier } from "@/components/owners/tier-ring";
import type { PortalStatus } from "@/components/owners/portal-dot";
import type { RiskLevel } from "@/components/owners/risk-pill";
import { deriveTier } from "./derive-tier";
import { getOwnerRetentionRisk } from "./retention-risk-service";
import { listOwnerStatements } from "@/features/finance/services";

export interface OwnerListItem {
  id: string;
  type: "individual" | "company" | "family_office";
  displayName: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  taxResidency: string | null;
  status: "active" | "onboarding" | "archived";
}

export interface OwnerDetail extends OwnerListItem {
  createdAt: string;
  updatedAt: string;
  /**
   * Persisted operator commission as a PERCENT (0-100), or null when unset.
   * Stored on owners.commission_pct as a fraction (migration 0169); converted
   * here for display + the EditCommissionModal.
   */
  commissionPct: number | null;
}

export interface OwnershipShareRow {
  id: string;
  ownerId: string;
  ownerName: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  sharePercent: number;
  model: "individual" | "pooled" | "hybrid";
  startsOn: string;
  endsOn: string | null;
  status: "active" | "scheduled" | "ended";
}

function fromMockOwners(): WithSource<OwnerListItem>[] {
  return mockOwners.map((o) => ({
    source: "mock",
    id: o.id,
    type: o.id === "owner-takeda" ? "family_office" : o.id === "owner-larsen" ? "company" : "individual",
    displayName: o.displayName,
    legalName: o.displayName,
    email: null,
    phone: null,
    nationality: o.country,
    taxResidency: o.country,
    status: "active",
  }));
}

export async function listOwners(): Promise<WithSource<OwnerListItem>[]> {
  const db = getDb();
  if (!db) return fromMockOwners();

  const rows = await db.select().from(owners).orderBy(asc(owners.displayName));
  return rows.map((r) => ({
    source: "db",
    id: r.id,
    type: r.type as OwnerListItem["type"],
    displayName: r.displayName,
    legalName: r.legalName,
    email: r.email,
    phone: r.phone,
    nationality: r.nationality,
    taxResidency: r.taxResidency,
    status: r.status as OwnerListItem["status"],
  }));
}

export async function getOwnerById(id: string): Promise<WithSource<OwnerDetail> | null> {
  const db = getDb();
  if (!db) {
    const m = mockOwners.find((o) => o.id === id);
    if (!m) return null;
    const base = fromMockOwners().find((o) => o.id === id);
    if (!base) return null;
    return {
      ...base,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      commissionPct: null,
    };
  }
  const [r] = await db.select().from(owners).where(eq(owners.id, id)).limit(1);
  if (!r) return null;
  return {
    source: "db",
    id: r.id,
    type: r.type as OwnerDetail["type"],
    displayName: r.displayName,
    legalName: r.legalName,
    email: r.email,
    phone: r.phone,
    nationality: r.nationality,
    taxResidency: r.taxResidency,
    status: r.status as OwnerDetail["status"],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    // commission_pct is stored as a fraction in [0,1]; surface as a percent.
    commissionPct: r.commissionPct !== null ? Number(r.commissionPct) * 100 : null,
  };
}

export async function listOwnershipShares(): Promise<WithSource<OwnershipShareRow>[]> {
  const db = getDb();
  if (!db) {
    const out: WithSource<OwnershipShareRow>[] = [];
    for (const o of mockOwners) {
      for (const h of o.holdings) {
        out.push({
          source: "mock",
          id: `${o.id}-${h.villa ?? h.project}`,
          ownerId: o.id,
          ownerName: o.displayName,
          villaId: h.villa ?? null,
          villaCode: h.villa ?? null,
          projectId: h.project ?? null,
          projectName: h.project ?? null,
          sharePercent: h.share,
          model: h.villa ? "individual" : "pooled",
          startsOn: "2024-01-01",
          endsOn: null,
          status: "active",
        });
      }
    }
    return out;
  }

  const rows = await db
    .select({
      s: ownershipShares,
      ownerName: owners.displayName,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(ownershipShares)
    .innerJoin(owners, eq(owners.id, ownershipShares.ownerId))
    .leftJoin(villas, eq(villas.id, ownershipShares.villaId))
    .leftJoin(projects, eq(projects.id, ownershipShares.projectId))
    .orderBy(asc(owners.displayName));

  return rows.map((r) => ({
    source: "db",
    id: r.s.id,
    ownerId: r.s.ownerId,
    ownerName: r.ownerName,
    villaId: r.s.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.s.projectId,
    projectName: r.projectName ?? null,
    sharePercent: Number(r.s.sharePercent),
    model: r.s.model as OwnershipShareRow["model"],
    startsOn: r.s.startsOn,
    endsOn: r.s.endsOn,
    status: r.s.status as OwnershipShareRow["status"],
  }));
}

/* ------------------------------------------------------------------ *
 * mgmt-03 — Director-CRM enrichment for the owners list.
 *
 * Joins the existing tier / retention-risk / statement / portal-grant
 * signals into the per-row shape the list table renders (TierRing,
 * RiskPill, PortalStatusDot, YTD net). All read-only; no new tables.
 * ------------------------------------------------------------------ */

export interface OwnerCrmRow extends OwnerListItem {
  tier: OwnerTier;
  /** Net payout to owner for the current calendar year, MINOR units. */
  ytdNetMinor: bigint;
  riskLevel: RiskLevel;
  riskSignalCount: number;
  portalStatus: PortalStatus;
  villaCount: number;
  /** ISO date of the most recent issued statement, or null. */
  lastContact: string | null;
}

export async function listOwnersForCrm(): Promise<WithSource<OwnerCrmRow>[]> {
  const base = await listOwners();
  if (base.length === 0) return [];

  // Mock mode — derive a deterministic-enough CRM row without DB joins.
  if (base[0]?.source === "mock") {
    const shares = await listOwnershipShares();
    return base.map((o) => {
      const villaCount = shares.filter(
        (s) => s.ownerId === o.id && s.villaId,
      ).length;
      return {
        ...o,
        tier: deriveTier({ villaCount, projectedArrUsd: 0 }),
        ytdNetMinor: 0n,
        riskLevel: "ok" as RiskLevel,
        riskSignalCount: 0,
        portalStatus: "not-invited" as PortalStatus,
        villaCount,
        lastContact: null,
      };
    });
  }

  const db = getDb();
  if (!db) return [];

  const allShares = await listOwnershipShares();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  // One portal-grant lookup for every owner (active grants → "active",
  // any grant → "invited", none → "not-invited").
  const grantRows = await db
    .select({ ownerId: appUsersOwners.ownerId, status: appUsersOwners.status })
    .from(appUsersOwners);
  const grantByOwner = new Map<string, PortalStatus>();
  for (const g of grantRows) {
    const prev = grantByOwner.get(g.ownerId);
    if (g.status === "active") grantByOwner.set(g.ownerId, "active");
    else if (prev !== "active") grantByOwner.set(g.ownerId, "invited");
  }

  return Promise.all(
    base.map(async (o) => {
      const villaIds = [
        ...new Set(
          allShares
            .filter((s) => s.ownerId === o.id && s.villaId)
            .map((s) => s.villaId as string),
        ),
      ];
      const villaCount = villaIds.length;

      const statements = await listOwnerStatements({ ownerId: o.id }).catch(
        () => [],
      );
      const ytdNetMinor = statements
        .filter((s) => s.periodStart >= yearStart)
        .reduce((acc, s) => acc + s.netPayoutMinor, 0n);
      const lastContact = statements[0]?.issuedAt
        ? statements[0].issuedAt.slice(0, 10)
        : (statements[0]?.periodEnd ?? null);

      // Reuse the statements already fetched above — avoids a second
      // identical query inside the risk service (the list's worst N+1).
      const risk = await getOwnerRetentionRisk(o.id, villaIds, {
        statements,
      }).catch(() => null);

      return {
        ...o,
        tier: deriveTier({ villaCount, projectedArrUsd: 0 }),
        ytdNetMinor,
        riskLevel: risk?.level ?? "ok",
        riskSignalCount: risk?.signals.length ?? 0,
        portalStatus: grantByOwner.get(o.id) ?? "not-invited",
        villaCount,
        lastContact,
      };
    }),
  );
}
