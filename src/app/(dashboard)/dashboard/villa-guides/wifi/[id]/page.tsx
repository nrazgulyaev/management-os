import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { villaWifiCredentials } from "@/lib/db/schema/villa-guides";
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
  const [row] = await db
    .select()
    .from(villaWifiCredentials)
    .where(eq(villaWifiCredentials.id, id))
    .limit(1);
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
