import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { Kpi, HandoffBadge, Card } from "@/components/dashboard/primitives";
import { NoItemsYet } from "@/components/ui/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <span>Security</span> / <span>WiFi migration</span>
          </div>
          <h1>WiFi credential migration</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Audit + status view for the AES-256-GCM rollout of villa WiFi
            passwords. The migration tool itself lives one click away — this page
            tracks progress + past runs.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/villa-guides/wifi/migrate"
            className="btn btn-accent"
          >
            Open migration tool
            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
          <Link
            href="/dashboard/villa-guides/wifi"
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            WiFi networks
          </Link>
        </div>
      </div>

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
        <Kpi
          label="Total credentials"
          value={String(counts.totalCredentials)}
          sub={`${completionPct}% encrypted`}
        />
        <Kpi
          label="Encrypted"
          value={String(counts.encryptedCount)}
          tone={counts.encryptedCount > 0 ? "success" : undefined}
          sub="Under AES-256-GCM (password_ciphertext)"
        />
        <Kpi
          label="Plaintext (legacy)"
          value={String(counts.legacyPlaintextCount)}
          tone={counts.legacyPlaintextCount > 0 ? "danger" : "success"}
          sub="display_password column populated"
        />
        <Kpi
          label="Migrated · 30d"
          value={String(counts.migratedLast30Days)}
          sub="Rows encrypted in the last 30 days"
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

      <div>
        <div className="label mb-2.5">
          Pending · {pending.length} row{pending.length === 1 ? "" : "s"} awaiting
          migration
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Networks with a legacy plaintext or v9E ciphertext but no v9G
          AES-256-GCM ciphertext. Each is converted in-place by the migration
          tool — idempotent.
        </p>
        {pending.length === 0 ? (
          <NoItemsYet
            entityLabel="pending migrations"
            description="Every villa WiFi credential is encrypted under the active key. Nothing left to migrate."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Network</th>
                  <th scope="col">Source column</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-3 text-xs mono">
                      {r.villaId
                        ? `villa ${r.villaId.slice(0, 8)}`
                        : r.projectId
                          ? `project ${r.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="row-title">{r.networkName}</td>
                    <td>
                      {r.hasDisplayPlaintext && (
                        <HandoffBadge tone="danger">display_password</HandoffBadge>
                      )}
                      {r.hasLegacyEncryptedCol && (
                        <HandoffBadge tone="warn">
                          password_encrypted (v9E)
                        </HandoffBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div>
        <div className="label mb-2.5">
          Audit log · Recent migration events ({events.length})
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Each successful row encryption emits a `wifi_password_migrated`
          security event. Last 50 entries shown.
        </p>
        {events.length === 0 ? (
          <NoItemsYet
            entityLabel="migration events"
            description="No migration events have been logged yet. Run the migration tool to encrypt your first batch."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">WiFi credential</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Key version</th>
                  <th scope="col">Actor IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{formatDateTime(e.createdAt)}</td>
                    <td className="mono text-[11px] text-ink-3">
                      {e.wifiCredentialId
                        ? e.wifiCredentialId.slice(0, 12)
                        : "—"}
                    </td>
                    <td className="mono text-[11px] text-ink-3">
                      {e.villaId
                        ? `villa ${e.villaId.slice(0, 8)}`
                        : e.projectId
                          ? `project ${e.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="text-xs">
                      <HandoffBadge tone="soft">
                        v{e.keyVersion ?? "?"}
                      </HandoffBadge>
                    </td>
                    <td className="mono text-[11px] text-ink-3">
                      {e.ipHash ? e.ipHash.slice(0, 12) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

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
