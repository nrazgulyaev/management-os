import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { WifiForm } from "@/components/villa-guides/wifi-form";

export const metadata = { title: "Add Wi-Fi" };
export const dynamic = "force-dynamic";

export default async function NewWifiPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <Link href="/dashboard/villa-guides/wifi">Wi-Fi</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Add Wi-Fi</h1>
        </div>
      </div>
      <WifiForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
