import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Wi-Fi", href: "/dashboard/villa-guides/wifi" },
          { label: "Migrate" },
        ]}
        title="Migrate Wi-Fi to encrypted"
        description="Sweeps every villa_wifi_credentials row with a legacy display_password and converts it to AES-256-GCM ciphertext under the active key. Idempotent — safe to re-run."
      />
      {!kmsReady && (
        <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-4 text-xs text-ink-secondary">
          STAY_LINK_KMS_SECRET is not configured. The migration uses a dev
          fallback key — DO NOT run this in production until the secret is
          set.
        </div>
      )}
      <Section
        eyebrow="Status"
        title={`${legacy.length} legacy row${legacy.length === 1 ? "" : "s"} pending`}
        description="The list shows networks still on plaintext. Once migrated, the row's `display_password` column is cleared and `password_ciphertext` carries the value under key v1."
      >
        {legacy.length === 0 ? (
          <p className="rounded-md border border-line-soft bg-surface p-6 text-sm text-ink-tertiary">
            All rows are migrated.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Network</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {legacy.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="px-3 py-2 text-ink font-medium">
                      {r.networkName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section eyebrow="Run" title="Migration sweep">
        <WifiMigrateButton kmsReady={kmsReady} />
      </Section>
    </div>
  );
}
