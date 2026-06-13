import { notFound } from "next/navigation";
import { and, eq, or } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { villaWifiCredentials } from "@/lib/db/schema/villa-guides";
import { villas as villasTable, projects as projectsTable } from "@/lib/db/schema/projects";
import { alias } from "drizzle-orm/pg-core";
import { requireOrgId } from "@/features/auth/require-org";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { WifiForm } from "@/components/villa-guides/wifi-form";
import { ciphertextKeyVersion } from "@/features/villa-guides/wifi-crypto";

export const metadata = { title: "Edit Wi-Fi" };
export const dynamic = "force-dynamic";

export default async function EditWifiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();
  const organizationId = await requireOrgId();
  // villa_wifi_credentials has no org column. Scope via projects: a row is
  // visible if its project (project-scoped row) OR its villa's project
  // (villa-scoped row, projectId NULL) belongs to the caller's org.
  const villaProject = alias(projectsTable, "villa_project");
  const [result] = await db
    .select({ row: villaWifiCredentials })
    .from(villaWifiCredentials)
    .leftJoin(
      projectsTable,
      eq(projectsTable.id, villaWifiCredentials.projectId),
    )
    .leftJoin(villasTable, eq(villasTable.id, villaWifiCredentials.villaId))
    .leftJoin(villaProject, eq(villaProject.id, villasTable.projectId))
    .where(
      and(
        eq(villaWifiCredentials.id, id),
        or(
          eq(projectsTable.organizationId, organizationId),
          eq(villaProject.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  const row = result?.row;
  if (!row) notFound();
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  const keyVersion = ciphertextKeyVersion(row.passwordCiphertext ?? null);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Wi-Fi", href: "/dashboard/villa-guides/wifi" },
          { label: row.networkName },
        ]}
        title={row.networkName}
        description="Edit and rotate the password. The list never reveals plaintext; entering a value here re-encrypts under the active key version."
        actions={
          row.passwordCiphertext ? (
            <Badge tone="success">encrypted · v{keyVersion ?? "?"}</Badge>
          ) : row.displayPassword ? (
            <Badge tone="warning">legacy plaintext</Badge>
          ) : (
            <Badge tone="neutral">no password</Badge>
          )
        }
      />
      <Section eyebrow="Edit" title="Network details">
        <WifiForm
          villas={villas.map((v) => ({
            id: v.id,
            label: `${v.unitCode} · ${v.projectName}`,
          }))}
          projects={projects.map((p) => ({ id: p.id, label: p.name }))}
          wifi={{
            id: row.id,
            villaId: row.villaId,
            projectId: row.projectId,
            networkName: row.networkName,
            instructionsMd: row.instructionsMd,
            hasCiphertext: Boolean(row.passwordCiphertext),
          }}
        />
      </Section>
    </div>
  );
}
