import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { CreateRatePlanForm } from "@/components/pricing/create-rate-plan-form";

export const metadata = { title: "New rate plan" };
export const dynamic = "force-dynamic";

export default async function NewRatePlanPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/bookings/rates">Rate plans</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New rate plan</h1>
        </div>
      </div>
      <CreateRatePlanForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
