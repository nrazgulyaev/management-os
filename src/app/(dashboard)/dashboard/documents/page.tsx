import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { DocumentAddButton } from "@/components/documents/document-add-button";
import { isDbConfigured } from "@/lib/env";
import {
  listDocsForApp,
  listTemplates,
  getDocCategoryCounts,
} from "@/features/documents/app-services";
import { DocumentsApp } from "@/components/documents/documents-app";
import { getAiKnowledgeData } from "./ai-knowledge-queries";
import { AiKnowledgePanel } from "./ai-knowledge-panel";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const [{ doc: initialDocId }, docs, templates, counts, aiKnowledge] =
    await Promise.all([
      searchParams,
      listDocsForApp(),
      listTemplates(),
      getDocCategoryCounts(),
      getAiKnowledgeData().catch(() => ({
        envReady: false,
        agents: [],
        assignments: [],
      })),
    ]);
  const source = isDbConfigured() ? "db" : "mock";

  // Org-visible agents for the "Feed to AI agent" controls (upload form
  // + preview pane). Hidden while ingestion is paused so the select
  // never becomes a dead control.
  const agentOptions = aiKnowledge.envReady
    ? aiKnowledge.agents.map(({ id, displayName }) => ({ id, displayName }))
    : [];
  const active = docs.filter((d) => d.status === "active");
  const expired = active.filter((d) => d.expired).length;
  const expiringSoon = active.filter((d) => d.expiringSoon).length;
  const awaitingSig = active.filter(
    (d) =>
      d.signatureStatus &&
      d.signatureStatus !== "signed" &&
      d.signatureStatus !== "countersigned" &&
      d.signatureStatus !== "declined" &&
      d.signatureStatus !== "cancelled",
  ).length;
  const renewalCount = expired + expiringSoon;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mono text-[10.5px] uppercase tracking-wide text-ink-tertiary">
              workspace / documents
            </p>
            <h1 className="mt-1.5 text-display text-[30px] font-normal leading-tight text-ink">
              Documents
              {renewalCount > 0 && (
                <span className="italic font-normal text-terra">
                  {" "}
                  · {renewalCount} expiring soon
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-ink-tertiary">
              {counts.all} docs · {expired} expired · {expiringSoon} expiring
              &lt; 30d · {awaitingSig} awaiting signature ·{" "}
              {counts.aiKnowledge} in AI knowledge
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <DocumentAddButton agents={agentOptions} />
          </div>
        </div>
      </header>
      <DbStatusNotice />

      <DocumentsApp
        docs={docs}
        templates={templates}
        counts={counts}
        initialDocId={initialDocId ?? null}
      />

      <AiKnowledgePanel
        docs={active.map((d) => ({
          id: d.id,
          title: d.title,
          documentType: d.documentType,
          fileName: d.fileName,
          mimeType: d.mimeType,
          hasFile: d.hasFile,
        }))}
        agents={aiKnowledge.agents}
        assignments={aiKnowledge.assignments}
        envReady={aiKnowledge.envReady}
      />
    </div>
  );
}
