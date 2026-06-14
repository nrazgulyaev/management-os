import Link from "next/link";
import { listProjects } from "@/features/projects/services";
import { CreateGroupForm } from "@/components/owner-stays/create-group-form";

export const metadata = { title: "New equivalence group" };
export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const projects = await listProjects();
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-stays">Owner stays</Link> /{" "}
            <Link href="/dashboard/owner-stays/equivalence-groups">
              Equivalence groups
            </Link>{" "}
            / <span>New</span>
          </div>
          <h1>New equivalence group</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            A pool of swap-comparable villas. After creating, add members on the
            list page.
          </p>
        </div>
      </div>
      <CreateGroupForm projects={projects.map((p) => ({ id: p.id, label: p.name }))} />
    </div>
  );
}
