import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> / <span>Conversations</span>
          </div>
          <h1>Sales conversations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${rows.length} thread(s). AI analysis is gated on explicit consent.`}
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">All threads</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No conversation threads"
            description="Threads aggregate WhatsApp / email / call activity per lead or buyer."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Channels</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Messages</th>
                  <th scope="col">Last msg</th>
                  <th scope="col">Consent</th>
                  <th scope="col">AI status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="mono text-xs">
                      <Link
                        href={`/development-os/marketing/conversations/${t.threadCode}`}
                        className="hover:underline"
                      >
                        {t.threadCode}
                      </Link>
                    </td>
                    <td className="text-xs">{(t.channelTypes ?? []).join(", ")}</td>
                    <td>
                      <HandoffBadge tone="soft">{t.outcome ?? "active"}</HandoffBadge>
                    </td>
                    <td className="num text-xs">
                      {t.totalMessageCount}
                    </td>
                    <td className="text-xs text-ink-3">
                      {new Date(t.lastMessageAt).toLocaleDateString()}
                    </td>
                    <td>
                      <HandoffBadge tone={t.consentToAnalyze ? "ok" : "soft"}>
                        {t.consentToAnalyze ? "yes" : "no"}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs">{t.aiAnalysisStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
