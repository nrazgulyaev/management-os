import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getThreadByCode } from "@/lib/development/server/conversation-review/conversation-queries";

export const metadata: Metadata = { title: "Conversation thread · Marketing" };
export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const thread = await getThreadByCode(code);
  if (!thread) notFound();
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/conversations">
              Conversations
            </Link>{" "}
            / <span>{thread.threadCode}</span>
          </div>
          <h1>{thread.threadCode}</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/conversations"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="flex flex-wrap gap-2">
            <HandoffBadge tone="info">
              outcome: {thread.outcome ?? "active"}
            </HandoffBadge>
            <HandoffBadge tone={thread.consentToAnalyze ? "ok" : "soft"}>
              consent: {thread.consentToAnalyze ? "yes" : "no"}
            </HandoffBadge>
            <HandoffBadge tone="soft">AI: {thread.aiAnalysisStatus}</HandoffBadge>
          </div>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Period</div>
        <Card padding="default">
          <p className="text-sm">
            Started: {new Date(thread.conversationStartAt).toLocaleString()}
            <br />
            Last message: {new Date(thread.lastMessageAt).toLocaleString()}
            <br />
            Messages: {thread.totalMessageCount} across {(thread.channelTypes ?? []).join(", ")}
          </p>
        </Card>
      </div>
      {!thread.consentToAnalyze && (
        <div>
          <div className="label mb-2.5">Privacy</div>
          <Card padding="default">
            <p className="text-sm leading-relaxed text-ink-secondary">
              AI analysis is gated on explicit operator-recorded consent. Use
              the <code>recordConsent</code> server action before triggering
              analysis.
            </p>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
