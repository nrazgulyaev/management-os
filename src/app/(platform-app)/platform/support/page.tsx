/**
 * PLATFORM SUPPORT INBOX — operator side (migration 0165).
 *
 * Every customer org's support threads in one queue. Live descendant of the
 * superseded super-admin mock 06-support-inbox.html (thread list with
 * org/priority/status + open→pending→closed lifecycle); the mock's SLA
 * timers / AI drafts / saved replies are out of v1 scope.
 *
 * Super-admin gated by the (platform-app) layout (isSuperAdminContext),
 * exactly like the sibling /platform pages; the write actions re-check.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { count, desc, eq, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DashboardKpi,
  FilterPills,
  ListTableCard,
  type FilterPillItem,
} from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { supportThreads, supportMessages } from "@/lib/db/schema/support";
import {
  STATUS_TONE,
  PRIORITY_TONE,
  fmtAge,
  relTime,
} from "@/app/(dashboard)/dashboard/settings/support/support-ui";

export const metadata: Metadata = { title: "Support · Platform Admin OS" };
export const dynamic = "force-dynamic";

const STATUSES = ["open", "pending", "closed"] as const;
const PRIORITIES = ["urgent", "high", "normal"] as const;

function medianOpenAge(rows: { createdAt: Date }[]): string {
  if (rows.length === 0) return "—";
  const ages = rows
    .map((r) => Date.now() - r.createdAt.getTime())
    .sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const median =
    ages.length % 2 === 1 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
  const hours = median / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUSES)[number])
    : "";
  const priority = (PRIORITIES as readonly string[]).includes(sp.priority ?? "")
    ? (sp.priority as (typeof PRIORITIES)[number])
    : "";

  const db = getDb();
  if (!db) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
        <PageHeader
          breadcrumbs={[
            { label: "Platform Admin OS", href: "/platform" },
            { label: "Support" },
          ]}
          eyebrow="Platform · all tenants"
          title="Support inbox"
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the support inbox."
        />
      </div>
    );
  }

  // Fetch everything (v1 scale), then filter/aggregate in memory — same
  // approach as /platform/organizations. KPIs always reflect ALL threads,
  // not the current filter.
  const allThreads = await db
    .select({
      id: supportThreads.id,
      subject: supportThreads.subject,
      status: supportThreads.status,
      priority: supportThreads.priority,
      createdAt: supportThreads.createdAt,
      updatedAt: supportThreads.updatedAt,
      orgName: organizations.name,
      orgCode: organizations.organizationCode,
    })
    .from(supportThreads)
    .innerJoin(organizations, eq(organizations.id, supportThreads.organizationId))
    .orderBy(desc(supportThreads.updatedAt));

  const kpis = {
    open: allThreads.filter((t) => t.status === "open").length,
    pending: allThreads.filter((t) => t.status === "pending").length,
    urgent: allThreads.filter(
      (t) => t.status !== "closed" && t.priority === "urgent",
    ).length,
    medianAge: medianOpenAge(allThreads.filter((t) => t.status === "open")),
  };

  const threads = allThreads.filter(
    (t) =>
      (status === "" || t.status === status) &&
      (priority === "" || t.priority === priority),
  );

  const messageCounts = new Map<string, number>();
  if (threads.length > 0) {
    const counts = await db
      .select({ threadId: supportMessages.threadId, n: count() })
      .from(supportMessages)
      .where(
        inArray(
          supportMessages.threadId,
          threads.map((t) => t.id),
        ),
      )
      .groupBy(supportMessages.threadId);
    for (const c of counts) messageCounts.set(c.threadId, Number(c.n));
  }

  const buildHref = (s: string, p: string): string => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (p) params.set("priority", p);
    const qs = params.toString();
    return qs ? `/platform/support?${qs}` : "/platform/support";
  };

  const statusPills: FilterPillItem[] = [
    {
      value: "",
      label: "All",
      href: buildHref("", priority),
      count: allThreads.length,
    },
    ...STATUSES.map((s) => ({
      value: s,
      label: s[0].toUpperCase() + s.slice(1),
      href: buildHref(s, priority),
      count: allThreads.filter((t) => t.status === s).length,
    })),
  ];

  const priorityPills: FilterPillItem[] = [
    {
      value: "",
      label: "All",
      href: buildHref(status, ""),
      count: allThreads.length,
    },
    ...PRIORITIES.map((p) => ({
      value: p,
      label: p[0].toUpperCase() + p.slice(1),
      href: buildHref(status, p),
      count: allThreads.filter((t) => t.priority === p).length,
    })),
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Support" },
        ]}
        eyebrow="Platform · all tenants"
        title="Support inbox"
        description="Every customer org's support threads. Reply as the platform team, mark pending while waiting on the customer, close when resolved."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <DashboardKpi
          label="Open"
          value={String(kpis.open)}
          status={kpis.open > 0 ? "warn" : "good"}
          hint="Waiting on us"
        />
        <DashboardKpi
          label="Pending"
          value={String(kpis.pending)}
          status="neutral"
          hint="Waiting on customer"
        />
        <DashboardKpi
          label="Urgent unresolved"
          value={String(kpis.urgent)}
          status={kpis.urgent > 0 ? "bad" : "good"}
          hint="Priority = urgent"
        />
        <DashboardKpi
          label="Median open age"
          value={kpis.medianAge}
          status="neutral"
          hint="Across open threads"
        />
      </div>

      <div className="flex flex-col gap-4">
        <FilterPills items={statusPills} current={status} label="Status" />
        <FilterPills items={priorityPills} current={priority} label="Priority" />
      </div>

      <ListTableCard
        eyebrow="Queue"
        title={
          status || priority
            ? `Filtered threads`
            : "All threads"
        }
        count={threads.length}
      >
        <Table>
          <THead>
            <TR>
              <TH>Org</TH>
              <TH>Subject</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH>Msgs</TH>
              <TH>Age</TH>
              <TH>Last activity</TH>
              <TH className="text-right">Open</TH>
            </TR>
          </THead>
          <TBody>
            {threads.length === 0 ? (
              <TR>
                <TD colSpan={8} className="text-ink-tertiary text-center py-10">
                  {allThreads.length === 0
                    ? "No support threads yet — customer orgs open them from Settings → Support."
                    : "No threads match your filter."}
                </TD>
              </TR>
            ) : (
              threads.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ink font-medium truncate">
                        {t.orgName}
                      </span>
                      <span className="text-xs text-ink-tertiary font-mono">
                        {t.orgCode}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Link
                      href={`/platform/support/${t.id}`}
                      className="text-ink hover:text-accent transition-colors"
                    >
                      {t.subject}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>
                      {t.priority}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>
                      {t.status}
                    </Badge>
                  </TD>
                  <TD className="tabular-nums">
                    {messageCounts.get(t.id) ?? 0}
                  </TD>
                  <TD className="font-mono text-sm">{fmtAge(t.createdAt)}</TD>
                  <TD className="text-ink-secondary text-sm">
                    {relTime(t.updatedAt)}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/platform/support/${t.id}`}
                      className="inline-flex items-center text-ink-tertiary hover:text-ink"
                    >
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </ListTableCard>
    </div>
  );
}
