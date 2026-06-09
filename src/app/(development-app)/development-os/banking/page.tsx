import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { bankConnections } from "@/lib/db/schema/banking";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Banking · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "danger" | "warn" | "info"> = {
  active: "ok",
  error: "danger",
  pending: "warn",
  paused: "warn",
  dry_run: "warn",
  archived: "info",
  connecting: "warn",
};

function isStale(lastSyncedAt: Date | null): boolean {
  if (!lastSyncedAt) return false;
  const ageMs = Date.now() - lastSyncedAt.getTime();
  return ageMs > 2 * 24 * 60 * 60 * 1000; // > 2 days
}

export default async function BankingPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> / Banking
            </div>
            <h1>Bank connections.</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const orgId = await requireOrgId();
  const rows = await safeQuery(
    "banking.bankConnections",
    db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.organizationId, orgId)),
    [] as Array<typeof bankConnections.$inferSelect>,
  );

  const activeCount = rows.filter((r) => r.status === "active").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const syncedToday = rows.filter(
    (r) => r.lastSyncedAt && r.lastSyncedAt.toISOString().slice(0, 10) === todayStr,
  ).length;
  const needsAttention = rows.filter(
    (r) => r.status === "error" || r.status === "paused" || isStale(r.lastSyncedAt),
  ).length;
  const currencyCount = new Set(rows.map((r) => r.currency)).size;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> / Bank
            connections
          </div>
          <h1>
            Bank <em>connections</em>.
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Per-account integrations. Revolut + Wise sync via API; Mandiri, BCA
            and manual accounts ingest via CSV statement upload at
            /finance/transactions.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/banking/new"
            className="btn btn-amber btn-sm"
          >
            + Add connection
          </Link>
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            Command center
          </Link>
        </div>
      </div>

      <div className="cfo-kpis cfo-kpis-4">
        <Kpi
          label="Connections"
          value={rows.length}
          sub={`${activeCount} active`}
          tone="success"
        />
        <Kpi label="Synced today" value={syncedToday} sub="API providers" />
        <Kpi
          label="Needs attention"
          value={needsAttention}
          sub="stale or errored"
          tone={needsAttention > 0 ? "warn" : undefined}
        />
        <Kpi label="Currencies" value={currencyCount || "—"} sub="distinct" />
      </div>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Connections</h3>
          <span className="label">
            {rows.length} · {activeCount} active
          </span>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="No bank connections yet"
            description="Click 'Add connection' to wire Revolut Business, Wise, Mandiri, BCA, or a manual account."
          />
        ) : (
          <div className="fin-prov-list">
            {rows.map((c) => {
              const stale = isStale(c.lastSyncedAt);
              const tone = stale ? "warn" : (STATUS_TONE[c.status] ?? "info");
              const label =
                c.accountName ?? c.externalAccountId ?? c.provider;
              const initial = (label || "·").slice(0, 1).toUpperCase();
              return (
                <Link
                  key={c.id}
                  href={`/development-os/banking/${c.id}`}
                  className="fin-prov"
                >
                  <span className="fin-prov-logo">{initial}</span>
                  <span className="fin-prov-body">
                    <span className="fin-prov-name">{label}</span>
                    <span className="fin-prov-sub">
                      {c.currency} · {c.provider}
                      {c.lastSyncedAt
                        ? ` · synced ${c.lastSyncedAt
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")}`
                        : " · never synced"}
                      {c.lastSyncStatus ? ` · ${c.lastSyncStatus}` : ""}
                    </span>
                  </span>
                  <HandoffBadge tone={tone}>
                    {stale ? "Stale" : c.status}
                  </HandoffBadge>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </DevelopmentShell>
  );
}
