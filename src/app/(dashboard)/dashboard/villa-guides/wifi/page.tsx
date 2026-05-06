import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listWifiAdmin } from "@/features/villa-guides/services";

export const metadata = { title: "Wi-Fi credentials" };
export const dynamic = "force-dynamic";

export default async function WifiList() {
  const rows = await listWifiAdmin();
  const legacyCount = rows.filter((r) => r.hasLegacyPlaintext).length;
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Wi-Fi" },
        ]}
        title="Wi-Fi credentials"
        description="Networks and the encrypted password served at /stay/[token]/wifi. v9G+: passwords are encrypted at rest with AES-256-GCM. The list never reveals plaintext — open a row to rotate."
        actions={
          <div className="flex gap-2">
            {legacyCount > 0 && (
              <Link
                href="/dashboard/villa-guides/wifi/migrate"
                className="text-sm px-3 py-1.5 rounded-sm border border-warning/50 bg-warning-weak/30 hover:border-warning"
              >
                Migrate {legacyCount} legacy plaintext row{legacyCount === 1 ? "" : "s"}
              </Link>
            )}
            <Link
              href="/dashboard/villa-guides/wifi/new"
              className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
            >
              + Add Wi-Fi
            </Link>
          </div>
        }
      />
      <Section eyebrow="Networks" title={`${rows.length} entries`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            None.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Network</th>
                  <th className="text-left px-3 py-2">Password</th>
                  <th className="text-left px-3 py-2">Migrated</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="px-3 py-2 text-ink font-medium">{r.networkName}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.hasCiphertext ? (
                        <Badge tone="success">
                          encrypted{r.keyVersion !== null ? ` · v${r.keyVersion}` : ""}
                        </Badge>
                      ) : r.hasLegacyPlaintext ? (
                        <Badge tone="warning">legacy plaintext</Badge>
                      ) : (
                        <Badge tone="neutral">none</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-[11px] tabular-nums">
                      {r.migratedAt ? r.migratedAt.slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/villa-guides/wifi/${r.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
