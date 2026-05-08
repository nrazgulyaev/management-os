import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listChangeOrders } from "@/lib/development/server/change-orders/change-order-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Change orders · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  requested: "warning",
  under_review: "info",
  approved: "info",
  in_progress: "info",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export default async function ChangeOrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Change orders" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const cos = await safeQuery(
    "listChangeOrders",
    listChangeOrders({ projectId: project.realProjectId }),
    [],
    4000,
  );

  const totalCost = cos
    .filter((c) => ["approved", "in_progress", "completed"].includes(c.status))
    .reduce((acc, c) => acc + Number(c.costImpactMinor), 0);
  const totalSchedule = cos
    .filter((c) => ["approved", "in_progress", "completed"].includes(c.status))
    .reduce((acc, c) => acc + c.scheduleImpactDays, 0);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Change orders" },
        ]}
        eyebrow={`${cos.length} change order${cos.length === 1 ? "" : "s"} · net cost impact $${(totalCost / 100).toLocaleString()} · schedule ${totalSchedule >= 0 ? "+" : ""}${totalSchedule}d`}
        title="Change orders / variations"
        description="Scope changes with cost + schedule impact. Cost and schedule impacts can be NEGATIVE (downgrades save money/time). Approval routing follows the configured approval-thresholds matrix."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/development-os/projects/${slug}/change-orders/new`}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New change order
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Project
              </Link>
            </Button>
          </div>
        }
      />

      {cos.length === 0 ? (
        <EmptyState
          title="No change orders yet"
          description="Use 'New change order' to log the first scope change."
        />
      ) : (
        <Section eyebrow="Log" title="All change orders (most recent first)">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Initiator</TH>
                <TH>Cost impact</TH>
                <TH>Schedule</TH>
                <TH>Status</TH>
                <TH>Requested</TH>
              </TR>
            </THead>
            <TBody>
              {cos.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/change-orders/${c.changeOrderCode}`}
                      className="hover:underline"
                    >
                      {c.changeOrderCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{c.title}</TD>
                  <TD className="text-xs">{c.initiatedByType}</TD>
                  <TDNum
                    className={
                      Number(c.costImpactMinor) > 0
                        ? "text-warning"
                        : Number(c.costImpactMinor) < 0
                          ? "text-success"
                          : ""
                    }
                  >
                    {Number(c.costImpactMinor) >= 0 ? "+" : ""}$
                    {(Number(c.costImpactMinor) / 100).toLocaleString()}{" "}
                    {c.costImpactCurrency}
                  </TDNum>
                  <TDNum
                    className={
                      c.scheduleImpactDays > 0
                        ? "text-warning"
                        : c.scheduleImpactDays < 0
                          ? "text-success"
                          : ""
                    }
                  >
                    {c.scheduleImpactDays >= 0 ? "+" : ""}
                    {c.scheduleImpactDays}d
                  </TDNum>
                  <TD>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {c.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{c.requestedAt}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
