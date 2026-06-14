import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { ContactForm } from "@/components/villa-guides/contact-form";

export const metadata = { title: "New emergency contact" };
export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <Link href="/dashboard/villa-guides/emergency-contacts">
              Emergency contacts
            </Link>{" "}
            / <span>New</span>
          </div>
          <h1>New emergency contact</h1>
        </div>
      </div>
      <ContactForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
