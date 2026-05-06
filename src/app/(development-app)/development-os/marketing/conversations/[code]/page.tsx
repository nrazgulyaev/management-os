import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <PageHeader
        title={thread.threadCode}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          {
            label: "Conversations",
            href: "/development-os/marketing/conversations",
          },
          { label: thread.threadCode },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/conversations">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Status">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">outcome: {thread.outcome ?? "active"}</Badge>
          <Badge tone={thread.consentToAnalyze ? "success" : "neutral"}>
            consent: {thread.consentToAnalyze ? "yes" : "no"}
          </Badge>
          <Badge tone="neutral">AI: {thread.aiAnalysisStatus}</Badge>
        </div>
      </Section>
      <Section title="Period">
        <p className="text-sm">
          Started: {new Date(thread.conversationStartAt).toLocaleString()}
          <br />
          Last message: {new Date(thread.lastMessageAt).toLocaleString()}
          <br />
          Messages: {thread.totalMessageCount} across {(thread.channelTypes ?? []).join(", ")}
        </p>
      </Section>
      {!thread.consentToAnalyze && (
        <Section title="Privacy">
          <p className="text-sm leading-relaxed text-ink-secondary">
            AI analysis is gated on explicit operator-recorded consent. Use
            the <code>recordConsent</code> server action before triggering
            analysis.
          </p>
        </Section>
      )}
    </DevelopmentShell>
  );
}
