import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  awaiting_review: "warn",
  approved: "ok",
  partially_approved: "info",
  rejected: "danger",
  edited_and_approved: "ok",
  expired: "soft",
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
        <div className="page-header">
          <div className="left">
            <h1>Inbox</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/ai-agents">AI agents</Link> /{" "}
            <span>Inbox</span>
          </div>
          <h1>Inbox</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${outputs.length} output(s) awaiting review.`}
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${outputs.length} awaiting review`}</div>
        {outputs.length === 0 ? (
          <EmptyState
            title="Inbox empty"
            description="No agent outputs are awaiting your review. Trigger an analysis from any agent page, or wait for the next scheduled cron run."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Link
                  href="/development-os/ai-agents"
                  className="btn btn-secondary btn-sm"
                >
                  Pick an agent to run
                </Link>
                <Link
                  href="/dashboard/ai/runs"
                  className="btn btn-secondary btn-sm"
                >
                  View past runs
                </Link>
              </div>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Agent</th>
                <th scope="col">Title</th>
                <th scope="col">Confidence</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map((o) => {
                const slug = AGENT_TO_SLUG[o.agentKey];
                const href = slug
                  ? `${AGENT_DETAIL_BASE}/${slug}/outputs/${o.outputCode}`
                  : null;
                return (
                  <tr key={o.id}>
                    <td className="mono text-[12px]">
                      {href ? (
                        <Link
                          href={href}
                          className="text-ink hover:text-terra"
                        >
                          {o.outputCode}
                        </Link>
                      ) : (
                        o.outputCode
                      )}
                    </td>
                    <td className="text-xs">{o.agentKey}</td>
                    <td className="row-title truncate max-w-md">{o.title}</td>
                    <td>
                      <HandoffBadge tone="soft">
                        {o.confidenceLevel ?? "—"}
                      </HandoffBadge>
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[o.status] ?? "soft"}>
                        {o.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs text-ink-3">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </DevelopmentShell>
  );
}
