import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getThreadByCode } from "@/lib/development/server/conversation-review/conversation-queries";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { ConsentControl } from "./_consent-control";

export const metadata: Metadata = { title: "Conversation thread · Marketing" };
export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [thread, me] = await Promise.all([
    getThreadByCode(code),
    getCurrentAppUser().catch(() => null),
  ]);
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
      <div className="mt-[18px]">
        <div className="label mb-2.5">Transcript</div>
        <EmptyState
          title="Transcript not yet captured"
          description="This thread records aggregate metadata (channels, message count, outcome) for performance and consent-gated AI analysis — the individual message bodies are not stored against it yet. Per-message capture is a planned follow-on."
        />
      </div>
      <div className="mt-[18px]">
        <div className="label mb-2.5">Privacy & AI</div>
        <Card padding="default">
          {me?.id ? (
            <ConsentControl
              threadCode={thread.threadCode}
              userId={me.id}
              consented={Boolean(thread.consentToAnalyze)}
              aiStatus={thread.aiAnalysisStatus}
            />
          ) : (
            <p className="text-sm leading-relaxed text-ink-secondary">
              Sign in as an internal user to record consent and trigger AI
              analysis on this thread.
            </p>
          )}
        </Card>
      </div>
    </DevelopmentShell>
  );
}
