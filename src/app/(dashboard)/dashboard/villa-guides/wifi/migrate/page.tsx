import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { listWifiAdmin } from "@/features/villa-guides/services";
import { WifiMigrateButton } from "@/components/guest-stays/wifi-migrate-button";
import { isStayLinkKmsConfigured } from "@/lib/env";

export const metadata = { title: "Migrate Wi-Fi to encrypted" };
export const dynamic = "force-dynamic";

export default async function WifiMigratePage() {
  const rows = await listWifiAdmin();
  const legacy = rows.filter((r) => r.hasLegacyPlaintext);
  const kmsReady = isStayLinkKmsConfigured();
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <Link href="/dashboard/villa-guides/wifi">Wi-Fi</Link> /{" "}
            <span>Migrate</span>
          </div>
          <h1>Migrate Wi-Fi to encrypted</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Sweeps every villa_wifi_credentials row with a legacy
            display_password and converts it to AES-256-GCM ciphertext under the
            active key. Idempotent — safe to re-run.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/villa-guides/security/wifi-migration"
            className="btn btn-secondary"
          >
            View migration status + audit log
            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
      {!kmsReady && (
        <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-4 text-xs text-ink-secondary">
          STAY_LINK_KMS_SECRET is not configured. The migration uses a dev
          fallback key — DO NOT run this in production until the secret is
          set.
        </div>
      )}
      <div>
        <div className="label mb-2.5">Status</div>
        <h2 className="serif text-[18px] mt-0 mb-1.5 font-normal">
          {legacy.length} legacy row{legacy.length === 1 ? "" : "s"} pending
        </h2>
        <p className="text-[13px] text-ink-3 mt-0 mb-3 max-w-[680px]">
          The list shows networks still on plaintext. Once migrated, the row's
          `display_password` column is cleared and `password_ciphertext` carries
          the value under key v1.
        </p>
        {legacy.length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary m-0">All rows are migrated.</p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Network</th>
                </tr>
              </thead>
              <tbody>
                {legacy.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-3 text-[12px]">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="row-title">{r.networkName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <div>
        <div className="label mb-2.5">Run</div>
        <WifiMigrateButton kmsReady={kmsReady} />
      </div>
    </div>
  );
}
