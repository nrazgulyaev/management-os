import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyDocuments,
  type InvestorDocumentRow,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";

export const metadata: Metadata = {
  title: "Documents · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

/** Filename extension chip shown on each doc tile. */
function docExt(documentType: string): string {
  const t = documentType.toLowerCase();
  if (t.includes("xls") || t.includes("statement") || t.includes("tax"))
    return "XLS";
  return "PDF";
}

interface DocGroup {
  key: string;
  title: string;
  docs: InvestorDocumentRow[];
}

/**
 * Sort the flat document feed into the mock's three card-buckets:
 * Agreements (subscription / commitment agreements), Reports (quarterly /
 * annual / drawdown receipts), and Tax / statements. Falls back to
 * `documentType` keywords so new doc kinds land in a sensible group.
 */
function groupDocuments(docs: InvestorDocumentRow[]): DocGroup[] {
  const agreements: InvestorDocumentRow[] = [];
  const tax: InvestorDocumentRow[] = [];
  const reports: InvestorDocumentRow[] = [];

  for (const d of docs) {
    const t = `${d.documentType} ${d.title}`.toLowerCase();
    if (d.source === "agreement" || t.includes("agreement")) {
      agreements.push(d);
    } else if (
      t.includes("tax") ||
      t.includes("statement") ||
      t.includes("k-1") ||
      t.includes("k1")
    ) {
      tax.push(d);
    } else {
      reports.push(d);
    }
  }

  return [
    { key: "agreements", title: "Agreements", docs: agreements },
    { key: "reports", title: "Reports", docs: reports },
    { key: "tax", title: "Tax", docs: tax },
  ].filter((g) => g.docs.length > 0);
}

export default async function PortalDocumentsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const docs = await getMyDocuments();
  const groups = groupDocuments(docs);

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle={strings.navDocuments}
    >
      <div className="flex flex-col gap-5">
        {/* Page header — mono eyebrow + Space Grotesk display title */}
        <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
              Documents
            </div>
            <h1 className="mt-1.5 font-display text-[29px] font-medium leading-none tracking-[-0.02em] text-ink">
              {strings.navDocuments}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-3">
              {docs.length} document{docs.length === 1 ? "" : "s"} linked to
              your commitments · agreements, reports, tax
            </p>
          </div>
        </header>

        {docs.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-line-soft bg-panel px-6 py-10 text-center shadow-soft-card">
            <FileText
              className="mx-auto mb-3 h-6 w-6 text-ink-4"
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-ink-secondary">
              No documents linked yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-tertiary">
              As Arconique uploads commitment agreements, capital-call notices,
              and distribution receipts to your account, they&apos;ll appear
              here. You&apos;ll receive a notification per upload.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <section
                key={group.key}
                className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card"
              >
                <div className="mb-3.5 flex items-baseline justify-between">
                  <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
                    {group.title}
                  </h3>
                  <span className="rounded-full border border-line-strong bg-canvas px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                    {group.docs.length}
                  </span>
                </div>
                <ul className="divide-y divide-line-soft">
                  {group.docs.map((d) => (
                    <li
                      key={d.id + d.source}
                      className="flex items-center gap-3.5 py-3.5"
                    >
                      {/* Doc tile with extension chip */}
                      <span className="relative flex h-12 w-10 flex-none items-center justify-center rounded-[7px] border border-line-strong bg-canvas">
                        <FileText
                          className="h-[18px] w-[18px] text-ink-3"
                          strokeWidth={1.7}
                        />
                        <span className="absolute bottom-1 font-mono text-[6.5px] font-semibold tracking-[0.05em] text-amber-deep">
                          {docExt(d.documentType)}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-ink">
                          {d.title}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-ink-tertiary">
                          {d.documentType} · {d.sourceLabel} ·{" "}
                          {new Date(d.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <a
                        href={`/api/documents/${d.id}/download`}
                        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-line-strong bg-panel text-ink-2 transition-colors hover:border-amber hover:text-amber-deep"
                        aria-label={`Download ${d.title}`}
                      >
                        <Download className="h-[15px] w-[15px]" strokeWidth={2} />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
