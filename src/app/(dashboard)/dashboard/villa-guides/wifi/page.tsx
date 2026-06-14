import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listWifiAdmin } from "@/features/villa-guides/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { WifiAddButton } from "@/components/villa-guides/wifi-add-button";

export const metadata = { title: "Wi-Fi credentials" };
export const dynamic = "force-dynamic";

export default async function WifiList() {
  const [rows, villas, projects] = await Promise.all([
    listWifiAdmin(),
    listVillas(),
    listProjects(),
  ]);
  const legacyCount = rows.filter((r) => r.hasLegacyPlaintext).length;
  const villaOpts = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName ?? ""}`,
  }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <span>Wi-Fi</span>
          </div>
          <h1>Wi-Fi credentials</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Networks and the encrypted password served at /stay/[token]/wifi.
            v9G+: passwords are encrypted at rest with AES-256-GCM. The list
            never reveals plaintext — open a row to rotate.
          </p>
        </div>
        <div className="actions">
          {legacyCount > 0 && (
            <Link
              href="/dashboard/villa-guides/wifi/migrate"
              className="btn btn-secondary btn-sm"
            >
              Migrate {legacyCount} legacy plaintext row{legacyCount === 1 ? "" : "s"}
            </Link>
          )}
          <WifiAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Networks</div>
        {rows.length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary m-0">None.</p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Network</th>
                  <th scope="col">Password</th>
                  <th scope="col">Migrated</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-3 text-[12px]">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="row-title">{r.networkName}</td>
                    <td>
                      {r.hasCiphertext ? (
                        <HandoffBadge tone="ok">
                          encrypted{r.keyVersion !== null ? ` · v${r.keyVersion}` : ""}
                        </HandoffBadge>
                      ) : r.hasLegacyPlaintext ? (
                        <HandoffBadge tone="warn">legacy plaintext</HandoffBadge>
                      ) : (
                        <HandoffBadge tone="soft">none</HandoffBadge>
                      )}
                    </td>
                    <td className="text-ink-3 text-[11px] tabular-nums">
                      {r.migratedAt ? r.migratedAt.slice(0, 10) : "—"}
                    </td>
                    <td className="text-right">
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
          </Card>
        )}
      </div>
    </div>
  );
}
