import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerDocuments, type OwnerDocument } from "@/features/owner-portal/get-documents";
import { SectionHeading } from "@/components/dashboard/primitives";
import { DocGroup } from "@/components/owner-portal/doc-group";
import { DocRow } from "@/components/owner-portal/doc-row";

/**
 * Sprint OWNER-PORTAL · redesign owner-06 — Documents.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/06-documents.html.
 * Wires the Phase 2.3 owner-06 primitives (DocGroup / DocRow) to the
 * `getOwnerDocuments` aggregate, which buckets owner-visible `documents`
 * rows into the 4 cabinet sections (Agreements / Tax / Statements /
 * Property & insurance). Download links route through the per-row
 * `fileUrl` (/api/documents/[id]/download).
 */

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

function subFor(d: OwnerDocument): string | undefined {
  if (d.sub) return d.sub;
  if (d.status === "expired" && d.expiresAt) return `Expired ${d.expiresAt}`;
  if (d.signedAt) return `Signed ${d.signedAt}`;
  if (d.expiresAt) return `Valid to ${d.expiresAt}`;
  return undefined;
}

export default async function OwnerDocumentsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const { groups } = await getOwnerDocuments(owner.ownerId);
  const totalDocs = groups.reduce((n, g) => n + g.documents.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Your archive"
        title="Documents"
        subtitle={
          <span className="owner-narr block mt-0 max-w-[640px]">
            {totalDocs === 0
              ? "Operator-shared documents for your villas appear here — management agreements, tax filings, statement archives, and insurance certificates. All downloadable; all hash-signed where applicable."
              : `${totalDocs} ${totalDocs === 1 ? "document" : "documents"} across contracts, tax, and statements. All downloadable; all hash-signed where applicable.`}
          </span>
        }
      />

      {totalDocs === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line-strong p-8 flex flex-col gap-2">
          <p className="text-sm text-ink-tertiary italic">
            Nothing shared yet. Your operator can upload management agreements,
            financial filings, insurance certificates, and building permits —
            they appear here, grouped by type.
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
        <>
          {groups.map((g) => (
            <DocGroup key={g.key} title={g.title} helper={g.helper}>
              {g.documents.length === 0 ? (
                <p className="dr-sub mono px-1 py-2.5">Nothing on file yet.</p>
              ) : (
                g.documents.map((d) => (
                  <DocRow
                    key={d.id}
                    name={d.name}
                    sub={subFor(d)}
                    kind={d.kind}
                    status={d.status}
                    when={d.when}
                    fileUrl={d.fileUrl}
                  />
                ))
              )}
            </DocGroup>
          ))}

          <p className="text-[12px] text-ink-tertiary">
            Looking for a monthly statement?{" "}
            <Link href="/owner/statements" className="text-terra hover:underline">
              Open Statements →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
