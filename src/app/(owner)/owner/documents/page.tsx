import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyDocuments } from "@/features/owner-portal/owner-portal-queries";

/**
 * STORAGE-1-WIRE — Owner documents page wired to live `documents` rows.
 * Filtered to visibility ∈ {owner_visible, owner, public, investor_visible}
 * across the owner's villas/projects.
 *
 * Download links route through /api/storage/documents/[id]/signed-url
 * which returns a 1h signed URL from Supabase Storage. Endpoint is
 * STORAGE-1-WIRE-API follow-up (current visible-data state surfaces
 * directly; download flow goes through the existing endpoint when
 * deployed).
 */

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function typeColor(documentType: string): "outline" | "info" | "success" | "gold" {
  switch (documentType) {
    case "statement":
    case "invoice":
    case "receipt":
      return "gold";
    case "contract":
    case "policy":
      return "info";
    case "kyc":
    case "certificate":
      return "success";
    default:
      return "outline";
  }
}

export default async function OwnerDocumentsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");
  const docs = await listMyDocuments(owner.ownerId).catch(() => []);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/owner" },
          { label: "Documents" },
        ]}
        title="Documents"
        description={
          docs.length === 0
            ? "Operator-shared documents for your villas. Nothing on file yet."
            : `${docs.length} ${docs.length === 1 ? "document" : "documents"} on file for your villas. Statement PDFs are on the Statements page.`
        }
      />

      {docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-canvas p-8">
          <FileText className="w-8 h-8 text-ink-tertiary mb-3" strokeWidth={1.5} />
          <p className="text-sm text-ink-tertiary italic mb-2">
            No documents shared yet. Your operator can upload management
            agreements, financial filings, insurance certificates, and
            building permits — they appear here.
          </p>
          <p className="text-xs text-ink-tertiary">
            Statement PDFs are always available on the{" "}
            <Link href="/owner/statements" className="text-terra hover:underline">
              Statements
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <Section eyebrow="On file" title="All documents">
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Type</TH>
                <TH>Filename</TH>
                <TH className="text-right">Size</TH>
                <TH>Uploaded</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {docs.map((d) => (
                <TR key={d.id}>
                  <TD className="font-medium">{d.title}</TD>
                  <TD>
                    <Badge tone={typeColor(d.documentType)}>
                      {d.documentType.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-xs text-ink-tertiary">
                    {d.fileName ?? "—"}
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-sm">
                    {fmtSize(d.sizeBytes)}
                  </TD>
                  <TD className="font-mono text-xs text-ink-tertiary">
                    {new Date(d.createdAt).toLocaleDateString("en-GB")}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/api/storage/documents/${d.id}/signed-url`}
                      target="_blank"
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      Download →
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </div>
  );
}
