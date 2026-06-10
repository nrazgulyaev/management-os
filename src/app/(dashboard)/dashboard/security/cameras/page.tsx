import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { listSecurityCameraDevices } from "@/features/security/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";
import { CameraAddButton } from "@/components/security/camera-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Cameras" };
export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, string> = {
  active: "badge-ok",
  offline: "badge-warn",
  maintenance: "badge-warn",
  archived: "badge-soft",
};

export default async function CamerasPage() {
  const [cameras, villas, projects] = await Promise.all([
    listSecurityCameraDevices(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));

  const activeCameras = cameras.filter((c) => c.status === "active").length;
  const attentionCameras = cameras.filter(
    (c) => c.status === "offline" || c.status === "maintenance",
  ).length;
  const archivedCameras = cameras.filter((c) => c.status === "archived").length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/security">Security</Link> /{" "}
            <span>Cameras</span>
          </div>
          <h1>Cameras</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Registry only — the platform never streams video. Operators click
            through to the vendor app for live feeds.
          </p>
        </div>
        <div className="actions">
          <CameraAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>

      <div className="gs-kpis">
        <Kpi label="Cameras" value={String(cameras.length)} sub="registered" />
        <Kpi
          label="Active"
          value={String(activeCameras)}
          tone={activeCameras > 0 ? "success" : undefined}
        />
        <Kpi
          label="Offline / maintenance"
          value={String(attentionCameras)}
          tone={attentionCameras > 0 ? "warn" : undefined}
        />
        <Kpi label="Archived" value={String(archivedCameras)} />
      </div>

      {cameras.length === 0 ? (
        <NoItemsYet
          entityLabel="cameras"
          description="Register a camera to surface its vendor app deep-link to operators on patrol."
          addHref="/dashboard/security/cameras/new"
          addLabel="+ New camera"
        />
      ) : (
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Location</th>
                <th scope="col">Villa</th>
                <th scope="col">Provider</th>
                <th scope="col">Status</th>
                <th scope="col">Access role</th>
                <th scope="col">Vendor</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {cameras.map((c) => (
                <tr key={c.id}>
                  <td className="row-title">{c.name}</td>
                  <td className="text-[12px]">{c.locationLabel}</td>
                  <td className="text-[12px]">
                    {c.villaCode ?? c.projectName ?? "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {c.provider ?? "—"}
                  </td>
                  <td>
                    <span
                      className={`badge ${STATUS_BADGES[c.status] ?? "badge-soft"}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {c.accessRole ?? "—"}
                  </td>
                  <td>
                    {c.externalAppUrl ? (
                      <a
                        href={c.externalAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-ink hover:underline underline-offset-4 whitespace-nowrap"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-ink-4 text-[12px]">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <SettingsRowActions
                      kind="camera"
                      row={{
                        id: c.id,
                        displayName: c.name,
                        values: {
                          name: c.name,
                          locationLabel: c.locationLabel,
                          provider: c.provider ?? "",
                          externalAppUrl: c.externalAppUrl ?? "",
                          accessRole: c.accessRole ?? "",
                          notes: c.notes ?? "",
                          projectId: c.projectId ?? "",
                          villaId: c.villaId ?? "",
                        },
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
