import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";

/**
 * OWNER-PORTAL-1A — Documents repository (DEMO-3 dependency).
 *
 * Storage pipeline + documents schema both ship with the DEMO-3
 * sprint. Until then this is a friendly empty state. PDF statement
 * downloads stay on the statements page.
 */

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function OwnerDocumentsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/owner" },
          { label: "Documents" },
        ]}
        title="Documents"
        description="Operator-shared documents for your villas: management agreements, financial filings, insurance certificates, building permits."
      />
      <div className="rounded-md border border-dashed border-line-strong bg-canvas p-8">
        <p className="text-sm text-ink-tertiary italic mb-2">
          Documents repository ships in DEMO-3 alongside the storage
          pipeline. Statement PDFs are available on the{" "}
          <a href="/owner/statements" className="text-terra hover:underline">
            Statements
          </a>{" "}
          page.
        </p>
      </div>
    </div>
  );
}
