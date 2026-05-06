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
    >
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          {strings.navDocuments}
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          {docs.length} document{docs.length === 1 ? "" : "s"} linked to your
          commitments
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
          No documents linked yet. As Arconique uploads agreements and
          drawdown receipts, they will appear here.
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden divide-y divide-stone-100">
          {docs.map((d) => (
            <div
              key={d.id + d.source}
              className="px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
                <div>
                  <div className="font-medium text-stone-900 text-sm">
                    {d.title}
                  </div>
                  <div className="text-xs text-stone-500">
                    {d.documentType} · {d.sourceLabel} ·{" "}
                    {new Date(d.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-stone-500">
                {d.source === "agreement" ? "Agreement" : "Receipt"}
              </span>
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
