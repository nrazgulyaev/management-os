import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { devCostCategories } from "@/lib/db/schema/dev-finance";
import { contacts } from "@/lib/db/schema/contacts";
import { createCommitmentLedger } from "@/lib/development/server/commitments-ledger-actions";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "New commitment · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewCommitmentLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New commitment" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [projectList, categoryList, vendorList] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({ id: devCostCategories.id, name: devCostCategories.displayName })
      .from(devCostCategories)
      .orderBy(asc(devCostCategories.displayOrder), asc(devCostCategories.categoryCode)),
    db
      .select({ id: contacts.id, name: contacts.fullName })
      .from(contacts)
      .orderBy(asc(contacts.fullName)),
  ]);

  async function handleSubmit(formData: FormData) {
    "use server";
    await requireInternalUser();
    const currency = String(formData.get("amountCurrency") ?? "USD");
    const isUsdt = currency === "USDT";
    const minorScale = isUsdt ? 1_000_000 : 100;
    const amountMajor = Number(formData.get("amountMajor") ?? "0");
    const amountOriginalMinor = Math.round(amountMajor * minorScale);

    try {
      await createCommitmentLedger({
        projectId: String(formData.get("projectId") ?? ""),
        categoryId: String(formData.get("categoryId") ?? ""),
        commitmentCode: String(formData.get("commitmentCode") ?? ""),
        vendorContactId: String(formData.get("vendorContactId") ?? "") || null,
        amountCurrency: currency as SupportedCurrency,
        amountOriginalMinor,
        fxRateAtCommit: String(formData.get("fxRateAtCommit") ?? "1") || "1",
        description: String(formData.get("description") ?? ""),
        committedDate: String(formData.get("committedDate") ?? ""),
        expectedCompletionDate:
          String(formData.get("expectedCompletionDate") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
      });
      redirect("/development-os/finance/commitments");
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/development-os/finance/commitments/new?error=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Commitments (PO)",
            href: "/development-os/finance/commitments",
          },
          { label: "New commitment" },
        ]}
        title="New procurement commitment"
        description="Record a signed vendor PO / contract. Money is captured in the contract's original currency with an FX snapshot to USD at commit time."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/commitments">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Commitments
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
        <Section eyebrow="Commitment" title="Project + vendor + terms">
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
            <Field label="Cost category">
              <select
                name="categoryId"
                required
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select a category…
                </option>
                {categoryList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commitment code">
              <input
                type="text"
                name="commitmentCode"
                required
                maxLength={64}
                placeholder="PO-2026-001"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Vendor (optional)">
              <select
                name="vendorContactId"
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="">No vendor linked</option>
                {vendorList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input
                type="number"
                name="amountMajor"
                required
                min="0"
                step="any"
                placeholder="0.00"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm text-right"
              />
            </Field>
            <Field label="Currency">
              <select
                name="amountCurrency"
                defaultValue="USD"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="FX rate → USD (1 USD = X currency)">
              <input
                type="text"
                name="fxRateAtCommit"
                required
                defaultValue="1"
                pattern="\d+(\.\d+)?"
                placeholder="1"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Committed date">
              <input
                type="date"
                name="committedDate"
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Expected completion date">
              <input
                type="date"
                name="expectedCompletionDate"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Description" full>
              <textarea
                name="description"
                rows={2}
                required
                placeholder="What this commitment covers"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
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
          <Button type="submit">Create commitment</Button>
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
