import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { devCommitmentsLedger } from "@/lib/db/schema/dev-finance";
import { getVendor } from "@/lib/development/server/vendors";
import { createVendorEngagement } from "@/lib/development/server/vendor-actions";

export const metadata: Metadata = {
  title: "New engagement · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New engagement" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const vendor = await getVendor(decodeURIComponent(code));
  if (!vendor) notFound();

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  const commitments = await db
    .select({
      id: devCommitmentsLedger.id,
      code: devCommitmentsLedger.commitmentCode,
      desc: devCommitmentsLedger.description,
    })
    .from(devCommitmentsLedger)
    .orderBy(devCommitmentsLedger.commitmentCode);

  async function handleSubmit(formData: FormData) {
    "use server";
    const projectId = String(formData.get("projectId") ?? "");
    const engagementCode = String(formData.get("engagementCode") ?? "");
    const scope = String(formData.get("scopeDescription") ?? "");
    const startDate = String(formData.get("startDate") ?? "");
    const expectedEndDate =
      String(formData.get("expectedEndDate") ?? "") || null;
    const commitmentLedgerId =
      String(formData.get("commitmentLedgerId") ?? "") || null;
    const notes = String(formData.get("notes") ?? "") || null;

    try {
      await createVendorEngagement({
        vendorId: vendor!.id,
        projectId,
        engagementCode,
        scopeDescription: scope,
        startDate,
        expectedEndDate,
        commitmentLedgerId,
        notes,
      });
      redirect(`/development-os/vendors/${vendor!.vendorCode}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/development-os/vendors/${code}/engagements/new?error=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Vendors", href: "/development-os/vendors" },
          { label: vendor.vendorCode, href: `/development-os/vendors/${vendor.vendorCode}` },
          { label: "New engagement" },
        ]}
        eyebrow={vendor.vendorCode}
        title={`New engagement — ${vendor.legalName}`}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/vendors/${vendor.vendorCode}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Vendor
            </Link>
          </Button>
        }
      />

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {sp.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4 max-w-3xl">
        <Section eyebrow="Engagement" title="Project + scope">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Project">
              <select
                name="projectId"
                required
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select a project…
                </option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Engagement code">
              <input
                type="text"
                name="engagementCode"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="ENG-2026-001"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Scope description" full>
              <textarea
                name="scopeDescription"
                rows={2}
                required
                placeholder="What this vendor is responsible for on this project"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                name="startDate"
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Expected end date">
              <input
                type="date"
                name="expectedEndDate"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Link to finance commitment (optional)" full>
              <select
                name="commitmentLedgerId"
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="">No linkage</option>
                {commitments.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.desc}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" full>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Section>
        <div className="flex items-center justify-end">
          <Button type="submit">Create engagement</Button>
        </div>
      </form>
    </DevelopmentShell>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
