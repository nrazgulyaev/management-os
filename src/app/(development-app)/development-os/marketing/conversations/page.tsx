import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listConversationThreads } from "@/lib/development/server/conversation-review/conversation-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Sales conversations · Marketing",
};
export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const rows = await safeQuery("threads", listConversationThreads(200), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Sales conversations"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Conversations" },
        ]}
        description={`${rows.length} thread(s). AI analysis is gated on explicit consent.`}
      />
      <Section title="All threads">
        {rows.length === 0 ? (
          <EmptyState
            title="No conversation threads"
            description="Threads aggregate WhatsApp / email / call activity per lead or buyer."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Channels</th>
                <th>Outcome</th>
                <th>Messages</th>
                <th>Last msg</th>
                <th>Consent</th>
                <th>AI status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/development-os/marketing/conversations/${t.threadCode}`}
                      className="hover:underline"
                    >
                      {t.threadCode}
                    </Link>
                  </td>
                  <td className="text-xs">{(t.channelTypes ?? []).join(", ")}</td>
                  <td>
                    <Badge tone="neutral">{t.outcome ?? "active"}</Badge>
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {t.totalMessageCount}
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {new Date(t.lastMessageAt).toLocaleDateString()}
                  </td>
                  <td>
                    <Badge tone={t.consentToAnalyze ? "success" : "neutral"}>
                      {t.consentToAnalyze ? "yes" : "no"}
                    </Badge>
                  </td>
                  <td className="text-xs">{t.aiAnalysisStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
