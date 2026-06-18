import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { CameraForm } from "@/components/security/camera-form";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "New camera" };
export const dynamic = "force-dynamic";

export default async function NewCameraPage() {
  const { allowed } = await requireCabinetAccess("security");
  if (!allowed) return <CabinetGate cabinet="Security" />;
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/security">Security</Link> /{" "}
            <Link href="/dashboard/security/cameras">Cameras</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New camera</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Registry entry — name, location, vendor portal URL. The platform
            never streams video.
          </p>
        </div>
      </div>
      <CameraForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </>
  );
}
