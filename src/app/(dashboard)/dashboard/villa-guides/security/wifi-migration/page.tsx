import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
import { isStayLinkKmsConfigured } from "@/lib/env";
import {
  summarizeWifiMigration,
  listWifiMigrationEvents,
  listPendingWifiMigrations,
} from "@/features/villa-guides/wifi-migration-services";

export const metadata = {
  title: "WiFi credential migration · Security",
};
export const dynamic = "force-dynamic";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default async function WifiMigrationStatusPage() {
  const [counts, events, pending] = await Promise.all([
    summarizeWifiMigration(),
    listWifiMigrationEvents(50),
    listPendingWifiMigrations(),
  ]);
  const kmsReady = isStayLinkKmsConfigured();

  const completionPct =
    counts.totalCredentials === 0
      ? 100
      : Math.round(
          ((counts.totalCredentials - pending.length) /
            counts.totalCredentials) *
            100,
        );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Security" },
          { label: "WiFi migration" },
        ]}
        title="WiFi credential migration"
        description="Audit + status view for the AES-256-GCM rollout of villa WiFi passwords. The migration tool itself lives one click away — this page tracks progress + past runs."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/dashboard/villa-guides/wifi/migrate">
                Open migration tool
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard/villa-guides/wifi">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                WiFi networks
              </Link>
            </Button>
          </div>
        }
      />

      <div
        className={
          "rounded-md border p-4 flex items-start gap-3 " +
          (kmsReady
            ? "border-success/40 bg-success-weak/30"
            : "border-warning/40 bg-warning-weak/30")
        }
      >
        {kmsReady ? (
          <ShieldCheck
            className="w-5 h-5 text-success flex-shrink-0 mt-0.5"
            strokeWidth={1.75}
          />
        ) : (
          <AlertTriangle
            className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
            strokeWidth={1.75}
          />
        )}
        <div className="text-sm">
          <div className="font-medium text-ink">
            {kmsReady
              ? "KMS key configured (STAY_LINK_KMS_SECRET active)"
              : "KMS key not configured — using dev fallback"}
          </div>
          <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
            {kmsReady
              ? "New encryptions use AES-256-GCM under STAY_LINK_KMS_SECRET v1. Migration sweeps are safe to run."
              : "STAY_LINK_KMS_SECRET is missing from this environment. The migration helper uses a dev fallback key — DO NOT run a sweep in production until the secret is set."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="Total credentials"
          value={String(counts.totalCredentials)}
          status="neutral"
          hint={`${completionPct}% encrypted`}
        />
        <DashboardKpi
          label="Encrypted"
          value={String(counts.encryptedCount)}
          status={counts.encryptedCount > 0 ? "good" : "neutral"}
          hint="Under AES-256-GCM (password_ciphertext)"
        />
        <DashboardKpi
          label="Plaintext (legacy)"
          value={String(counts.legacyPlaintextCount)}
          status={counts.legacyPlaintextCount > 0 ? "bad" : "good"}
          hint="display_password column populated"
        />
        <DashboardKpi
          label="Migrated · 30d"
          value={String(counts.migratedLast30Days)}
          status="neutral"
          hint="Rows encrypted in the last 30 days"
        />
      </div>

      {counts.legacyEncryptedColumnCount > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-4 text-xs text-ink-secondary">
          <span className="font-medium text-ink">
            {counts.legacyEncryptedColumnCount}
          </span>{" "}
          row(s) still carry the v9E `password_encrypted` column without a
          v9G `password_ciphertext`. Re-run the migration sweep to convert.
        </div>
      )}

      <Section
        eyebrow="Pending"
        title={`${pending.length} row${pending.length === 1 ? "" : "s"} awaiting migration`}
        description="Networks with a legacy plaintext or v9E ciphertext but no v9G AES-256-GCM ciphertext. Each is converted in-place by the migration tool — idempotent."
      >
        {pending.length === 0 ? (
          <NoItemsYet
            entityLabel="pending migrations"
            description="Every villa WiFi credential is encrypted under the active key. Nothing left to migrate."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Network</th>
                  <th className="text-left px-3 py-2">Source column</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs font-mono">
                      {r.villaId
                        ? `villa ${r.villaId.slice(0, 8)}`
                        : r.projectId
                          ? `project ${r.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="px-3 py-2 text-ink font-medium">
                      {r.networkName}
                    </td>
                    <td className="px-3 py-2">
                      {r.hasDisplayPlaintext && (
                        <Badge tone="danger">display_password</Badge>
                      )}
                      {r.hasLegacyEncryptedCol && (
                        <Badge tone="warning">password_encrypted (v9E)</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Audit log"
        title={`Recent migration events (${events.length})`}
        description="Each successful row encryption emits a `wifi_password_migrated` security event. Last 50 entries shown."
      >
        {events.length === 0 ? (
          <NoItemsYet
            entityLabel="migration events"
            description="No migration events have been logged yet. Run the migration tool to encrypt your first batch."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">WiFi credential</th>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Key version</th>
                  <th className="text-left px-3 py-2">Actor IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {e.wifiCredentialId
                        ? e.wifiCredentialId.slice(0, 12)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {e.villaId
                        ? `villa ${e.villaId.slice(0, 8)}`
                        : e.projectId
                          ? `project ${e.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge tone="neutral">v{e.keyVersion ?? "?"}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {e.ipHash ? e.ipHash.slice(0, 12) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-xs text-ink-tertiary">
        This page is read-only. To run a sweep,{" "}
        <Link
          href="/dashboard/villa-guides/wifi/migrate"
          className="underline underline-offset-4 text-ink hover:text-ink-secondary"
        >
          open the migration tool
        </Link>
        . Sweeps are idempotent — already-encrypted rows are skipped, never
        re-encrypted.
      </p>
    </div>
  );
}
