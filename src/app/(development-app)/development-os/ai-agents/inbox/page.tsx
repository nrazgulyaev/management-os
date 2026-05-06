import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "AI agents inbox · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  awaiting_review: "warning",
  approved: "success",
  partially_approved: "info",
  rejected: "danger",
  edited_and_approved: "success",
  expired: "neutral",
};

const AGENT_DETAIL_BASE = "/development-os/ai-agents";

const AGENT_TO_SLUG: Record<string, string> = {
  qs_cost_analyst: "qs-cost-analyst",
  procurement_analyst: "procurement-analyst",
  tax_assistant: "tax-assistant",
  marketing_assistant: "marketing-assistant",
  executive_business: "executive-business",
  daily_digest: "daily-digest",
  weekly_plan: "weekly-plan",
};

export default async function AgentsInboxPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Inbox" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const outputs = await safeQuery(
    "agentOutputs",
    db
      .select()
      .from(agentOutputs)
      .where(eq(agentOutputs.status, "awaiting_review"))
      .orderBy(desc(agentOutputs.createdAt))
      .limit(200),
    [],
  );

  return (
    <DevelopmentShell>
      <PageHeader
        title="Inbox"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents", href: "/development-os/ai-agents" },
          { label: "Inbox" },
        ]}
        description={`${outputs.length} output(s) awaiting review.`}
      />
      <Section title={`${outputs.length} awaiting review`}>
        {outputs.length === 0 ? (
          <EmptyState
            title="Inbox empty"
            description="No agent outputs are awaiting your review."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Agent</th>
                <th>Title</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map((o) => {
                const slug = AGENT_TO_SLUG[o.agentKey];
                const href = slug
                  ? `${AGENT_DETAIL_BASE}/${slug}/outputs/${o.outputCode}`
                  : null;
                return (
                  <tr
                    key={o.id}
                    className="border-b border-line-soft hover:bg-muted/30"
                  >
                    <td className="py-2 font-mono text-xs">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {o.outputCode}
                        </Link>
                      ) : (
                        o.outputCode
                      )}
                    </td>
                    <td className="text-xs">{o.agentKey}</td>
                    <td className="truncate max-w-md">{o.title}</td>
                    <td>
                      <Badge tone="neutral">{o.confidenceLevel ?? "—"}</Badge>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                        {o.status}
                      </Badge>
                    </td>
                    <td className="text-xs text-ink-tertiary">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
