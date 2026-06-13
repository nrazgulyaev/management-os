import "server-only";

import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { villaWifiCredentials } from "@/lib/db/schema/villa-guides";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { authSecurityEvents } from "@/lib/db/schema/security";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Stage 10.M.4 — Read-only helpers for the WiFi credential migration
 * status / audit-log page.
 *
 * The migration tool itself lives at /dashboard/villa-guides/wifi/migrate
 * (Stage 8.A.5) and writes `wifi_password_migrated` security events
 * via `recordSecurityEvent`. This module surfaces the audit trail +
 * roll-up counts so admins can see "how many rows are still on
 * plaintext, when did the last sweep run, who triggered it" without
 * having to actually run the sweep.
 */

export interface WifiMigrationCounts {
  totalCredentials: number;
  encryptedCount: number;
  legacyPlaintextCount: number;
  legacyEncryptedColumnCount: number;
  neverHadPasswordCount: number;
  migratedLast30Days: number;
}

export interface WifiMigrationEvent {
  id: string;
  appUserId: string | null;
  ipHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Pulled out of metadata for convenience. */
  wifiCredentialId: string | null;
  villaId: string | null;
  projectId: string | null;
  keyVersion: number | null;
  actorAppUserId: string | null;
}

export async function summarizeWifiMigration(): Promise<WifiMigrationCounts> {
  const empty: WifiMigrationCounts = {
    totalCredentials: 0,
    encryptedCount: 0,
    legacyPlaintextCount: 0,
    legacyEncryptedColumnCount: 0,
    neverHadPasswordCount: 0,
    migratedLast30Days: 0,
  };
  const db = getDb();
  if (!db) return empty;
  const organizationId = await requireOrgId();
  // villa_wifi_credentials has no org column. Scope via projects on either the
  // project-scoped path (projectId) or the villa-scoped path
  // (villaId → villas.projectId).
  const aggVillaProject = alias(projectsTable, "agg_villa_project");
  const orgScope = or(
    eq(projectsTable.organizationId, organizationId),
    eq(aggVillaProject.organizationId, organizationId),
  );

  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      encrypted: sql<number>`count(*) FILTER (WHERE ${villaWifiCredentials.passwordCiphertext} IS NOT NULL)::int`,
      plaintext: sql<number>`count(*) FILTER (WHERE ${villaWifiCredentials.displayPassword} IS NOT NULL)::int`,
      legacyEncryptedCol: sql<number>`count(*) FILTER (WHERE ${villaWifiCredentials.passwordEncrypted} IS NOT NULL AND ${villaWifiCredentials.passwordCiphertext} IS NULL)::int`,
      neverHad: sql<number>`count(*) FILTER (WHERE ${villaWifiCredentials.displayPassword} IS NULL AND ${villaWifiCredentials.passwordCiphertext} IS NULL AND ${villaWifiCredentials.passwordEncrypted} IS NULL)::int`,
    })
    .from(villaWifiCredentials)
    .leftJoin(projectsTable, eq(projectsTable.id, villaWifiCredentials.projectId))
    .leftJoin(villas, eq(villas.id, villaWifiCredentials.villaId))
    .leftJoin(aggVillaProject, eq(aggVillaProject.id, villas.projectId))
    .where(orgScope);

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const migVillaProject = alias(projectsTable, "mig_villa_project");
  const [migAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(villaWifiCredentials)
    .leftJoin(projectsTable, eq(projectsTable.id, villaWifiCredentials.projectId))
    .leftJoin(villas, eq(villas.id, villaWifiCredentials.villaId))
    .leftJoin(migVillaProject, eq(migVillaProject.id, villas.projectId))
    .where(
      and(
        or(
          eq(projectsTable.organizationId, organizationId),
          eq(migVillaProject.organizationId, organizationId),
        ),
        isNotNull(villaWifiCredentials.passwordMigratedAt),
        sql`${villaWifiCredentials.passwordMigratedAt} >= ${cutoff.toISOString()}`,
      ),
    );

  return {
    totalCredentials: Number(agg?.total) || 0,
    encryptedCount: Number(agg?.encrypted) || 0,
    legacyPlaintextCount: Number(agg?.plaintext) || 0,
    legacyEncryptedColumnCount: Number(agg?.legacyEncryptedCol) || 0,
    neverHadPasswordCount: Number(agg?.neverHad) || 0,
    migratedLast30Days: Number(migAgg?.count) || 0,
  };
}

export async function listWifiMigrationEvents(
  limit = 50,
): Promise<WifiMigrationEvent[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = await db
    .select({
      id: authSecurityEvents.id,
      appUserId: authSecurityEvents.appUserId,
      ipHash: authSecurityEvents.ipHash,
      metadata: authSecurityEvents.metadata,
      createdAt: authSecurityEvents.createdAt,
    })
    .from(authSecurityEvents)
    .where(
      and(
        eq(authSecurityEvents.organizationId, organizationId),
        eq(authSecurityEvents.eventType, "wifi_password_migrated"),
      ),
    )
    .orderBy(desc(authSecurityEvents.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      appUserId: r.appUserId,
      ipHash: r.ipHash,
      metadata: md,
      createdAt: r.createdAt.toISOString(),
      wifiCredentialId:
        typeof md.wifiCredentialId === "string"
          ? md.wifiCredentialId
          : null,
      villaId: typeof md.villaId === "string" ? md.villaId : null,
      projectId: typeof md.projectId === "string" ? md.projectId : null,
      keyVersion:
        typeof md.keyVersion === "number" ? md.keyVersion : null,
      actorAppUserId:
        typeof md.actorAppUserId === "string" ? md.actorAppUserId : null,
    };
  });
}

export interface PendingMigrationRow {
  id: string;
  villaId: string | null;
  projectId: string | null;
  networkName: string;
  hasLegacyEncryptedCol: boolean;
  hasDisplayPlaintext: boolean;
}

export async function listPendingWifiMigrations(): Promise<
  PendingMigrationRow[]
> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // villa_wifi_credentials has no org column. Scope via projects on either the
  // project-scoped path (projectId) or the villa-scoped path
  // (villaId → villas.projectId).
  const pendingVillaProject = alias(projectsTable, "pending_villa_project");
  const rows = await db
    .select({
      id: villaWifiCredentials.id,
      villaId: villaWifiCredentials.villaId,
      projectId: villaWifiCredentials.projectId,
      networkName: villaWifiCredentials.networkName,
      passwordEncrypted: villaWifiCredentials.passwordEncrypted,
      displayPassword: villaWifiCredentials.displayPassword,
    })
    .from(villaWifiCredentials)
    .leftJoin(projectsTable, eq(projectsTable.id, villaWifiCredentials.projectId))
    .leftJoin(villas, eq(villas.id, villaWifiCredentials.villaId))
    .leftJoin(pendingVillaProject, eq(pendingVillaProject.id, villas.projectId))
    .where(
      and(
        or(
          eq(projectsTable.organizationId, organizationId),
          eq(pendingVillaProject.organizationId, organizationId),
        ),
        isNull(villaWifiCredentials.passwordCiphertext),
      ),
    );

  return rows
    .filter(
      (r) => r.displayPassword !== null || r.passwordEncrypted !== null,
    )
    .map((r) => ({
      id: r.id,
      villaId: r.villaId,
      projectId: r.projectId,
      networkName: r.networkName,
      hasLegacyEncryptedCol: r.passwordEncrypted !== null,
      hasDisplayPlaintext: r.displayPassword !== null,
    }));
}
