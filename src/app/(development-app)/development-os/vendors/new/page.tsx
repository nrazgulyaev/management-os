import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { createVendor } from "@/lib/development/server/vendor-actions";
import {
  VENDOR_TYPES,
  VENDOR_TYPE_LABEL,
} from "@/lib/development/constants/vendor-constants";

export const metadata: Metadata = { title: "New vendor · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  async function handleSubmit(formData: FormData) {
    "use server";
    const vendorCode = String(formData.get("vendorCode") ?? "");
    const legalName = String(formData.get("legalName") ?? "");
    const vendorType = String(formData.get("vendorType") ?? "other") as
      | (typeof VENDOR_TYPES)[number];
    const legalEntityType = String(formData.get("legalEntityType") ?? "") || null;
    const primaryEmail = String(formData.get("primaryEmail") ?? "") || null;
    const primaryPhone = String(formData.get("primaryPhone") ?? "") || null;
    const whatsappPhone = String(formData.get("whatsappPhone") ?? "") || null;
    const address = String(formData.get("address") ?? "") || null;
    const taxId = String(formData.get("taxId") ?? "") || null;
    const businessLicenseNumber =
      String(formData.get("businessLicenseNumber") ?? "") || null;
    const businessLicenseExpiry =
      String(formData.get("businessLicenseExpiry") ?? "") || null;
    const bankName = String(formData.get("bankName") ?? "") || null;
    const bankAccountHolder =
      String(formData.get("bankAccountHolder") ?? "") || null;
    const bankAccountNumber =
      String(formData.get("bankAccountNumber") ?? "") || null;
    const bankSwift = String(formData.get("bankSwift") ?? "") || null;
    const notes = String(formData.get("notes") ?? "") || null;

    let result: { vendorCode: string } | null = null;
    try {
      result = await createVendor({
        vendorCode,
        legalName,
        vendorType,
        legalEntityType,
        primaryEmail,
        primaryPhone,
        whatsappPhone,
        address,
        taxId,
        businessLicenseNumber,
        businessLicenseExpiry,
        bankName,
        bankAccountHolder,
        bankAccountNumber,
        bankSwift,
        notes,
      });
    } catch (err) {
      // SESSION-RESOLUTION-1 P4 — modern Next.js redirect throws an error
      // whose .digest property starts with "NEXT_REDIRECT", NOT .message.
      // The previous .message.startsWith check missed that case, so a
      // legitimate user error inside the try was caught and re-redirected,
      // but a redirect from elsewhere in the call stack also got caught
      // and re-redirected — producing the "Server Components render error"
      // banner the operator hit.
      if (err instanceof Error) {
        const digest = (err as Error & { digest?: string }).digest;
        if (digest?.startsWith("NEXT_REDIRECT") || err.message.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
      }
      const msg = friendlyVendorError(err);
      redirect(`/development-os/vendors/new?error=${encodeURIComponent(msg)}`);
    }
    if (result) {
      redirect(`/development-os/vendors/${result.vendorCode}`);
    }
  }

  function friendlyVendorError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // Postgres error codes inside the message
    if (raw.includes("23505")) return "Vendor code already exists — please choose a unique code.";
    if (raw.includes("23514")) return "Invalid value — please re-check vendor type and other fields.";
    if (raw.includes("23502")) return "A required field is missing.";
    if (raw.includes("violates check constraint")) return raw;
    // Zod validation
    if (raw.startsWith("[") || raw.includes("Invalid")) {
      return `Validation error: ${raw.slice(0, 200)}`;
    }
    return raw.slice(0, 300);
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Vendors", href: "/development-os/vendors" },
          { label: "New" },
        ]}
        title="New vendor"
        description="Construction vendor, subcontractor, supplier, or consultant. Engagement linkage to specific projects happens after creation."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/vendors">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All vendors
            </Link>
          </Button>
        }
      />

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {sp.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-6 max-w-3xl">
        <Section eyebrow="Identity" title="Required fields">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Vendor code">
              <input
                type="text"
                name="vendorCode"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="VND-001"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Legal name">
              <input
                type="text"
                name="legalName"
                required
                placeholder="PT Konstruksi Jaya"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Vendor type">
              <select
                name="vendorType"
                required
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select type…
                </option>
                {VENDOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VENDOR_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Legal entity type">
              <input
                type="text"
                name="legalEntityType"
                placeholder="pt / cv / pma / individual"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Section>

        <Section eyebrow="Contact" title="How to reach them">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email">
              <input
                type="email"
                name="primaryEmail"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                name="primaryPhone"
                placeholder="+62 361 ..."
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="WhatsApp">
              <input
                type="tel"
                name="whatsappPhone"
                placeholder="+62 812 ..."
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Address" full>
              <input
                type="text"
                name="address"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Section>

        <Section eyebrow="Compliance + banking" title="Optional">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tax ID (NPWP)">
              <input
                type="text"
                name="taxId"
                placeholder="01.234.567.8-901.000"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Business license #">
              <input
                type="text"
                name="businessLicenseNumber"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="License expiry">
              <input
                type="date"
                name="businessLicenseExpiry"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Bank name">
              <input
                type="text"
                name="bankName"
                placeholder="Bank Mandiri / BCA / BNI"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Account holder">
              <input
                type="text"
                name="bankAccountHolder"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Account number">
              <input
                type="text"
                name="bankAccountNumber"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="SWIFT (international)">
              <input
                type="text"
                name="bankSwift"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
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
          <Button type="submit">Create vendor</Button>
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
