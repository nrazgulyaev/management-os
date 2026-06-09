import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyDocuments } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";

export const metadata: Metadata = {
  title: "Documents · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const docs = await getMyDocuments();

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle={strings.navDocuments}
    >
      <div>
        <h1 className="font-display text-3xl text-ink">
          {strings.navDocuments}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {docs.length} document{docs.length === 1 ? "" : "s"} linked to your
          commitments
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            No documents linked yet
          </p>
          <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
            As Arconique uploads commitment agreements, capital-call notices,
            and distribution receipts to your account, they&apos;ll appear here.
            You&apos;ll receive a notification per upload.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden divide-y divide-line-soft">
          {docs.map((d) => (
            <div
              key={d.id + d.source}
              className="px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
                <div>
                  <div className="font-medium text-ink text-sm">
                    {d.title}
                  </div>
                  <div className="text-xs text-ink-tertiary">
                    {d.documentType} · {d.sourceLabel} ·{" "}
                    {new Date(d.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-ink-tertiary">
                {d.source === "agreement" ? "Agreement" : "Receipt"}
              </span>
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
