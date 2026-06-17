import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getThreadByCode,
  listConversationMessages,
} from "@/lib/development/server/conversation-review/conversation-queries";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { ConsentControl } from "./_consent-control";
import { LogMessageForm } from "./_log-message-form";

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
  const messages = await listConversationMessages(thread.id);
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
        <Card padding="default">
          {messages.length === 0 ? (
            <EmptyState
              title="No messages logged yet"
              description="Log the conversation's messages below to build the transcript. Each entry updates the thread's message count and last-activity time."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div
                    key={m.id}
                    className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-lg px-3 py-2 ${
                        outbound
                          ? "bg-ink-1 text-white"
                          : "bg-surface-2 text-ink-1"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] uppercase tracking-wide opacity-70">
                          {outbound ? "Us" : (m.senderName ?? "Prospect")}
                        </span>
                        <span className="text-[11px] opacity-60">
                          {m.channelType}
                        </span>
                        <span className="text-[11px] opacity-60">
                          {new Date(m.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {m.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3.5 pt-3.5 border-t border-line">
            <div className="label mb-2">Log a message</div>
            <LogMessageForm threadCode={thread.threadCode} />
          </div>
        </Card>
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
