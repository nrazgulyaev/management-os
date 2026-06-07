import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  getApproximateRowCounts,
  type SafeReadResult,
} from "@/features/system/db-health";
import {
  isDbConfigured,
  isSupabaseAuthConfigured,
  backupRunbookUrl,
  isSecurityEncryptionConfigured,
  isStayLinkKmsConfigured,
  isNotificationsDryRun,
} from "@/lib/env";
import { env } from "@/lib/env";

export const metadata = { title: "System health" };
export const dynamic = "force-dynamic";

/**
 * P114 — module-grouped tracked tables.  One row per major feature
 * area so an operator can spot which subsystem is missing migrations.
 */
const TRACKED_TABLE_GROUPS: Array<{ group: string; tables: string[] }> = [
  {
    group: "Identity & access",
    tables: ["app_users", "roles", "permissions", "user_roles", "access_grants"],
  },
  {
    group: "Owners & villas",
    tables: ["owners", "villas", "owner_villa_links", "villa_units"],
  },
  {
    group: "Bookings",
    tables: ["bookings", "booking_channels", "booking_holds", "rate_plans"],
  },
  {
    group: "Direct booking",
    tables: [
      "direct_booking_holds",
      "direct_booking_requests",
      "direct_booking_finance_links",
      "direct_booking_messages",
    ],
  },
  {
    group: "Finance & statements",
    tables: [
      "owner_statements",
      "statement_lines",
      "statement_source_groups",
      "statement_explanation_snapshots",
      "owner_booking_summaries",
    ],
  },
  {
    group: "Operations",
    tables: ["operation_tasks", "maintenance_tickets", "checklist_items"],
  },
  {
    group: "Guest experience",
    tables: [
      "guest_stay_tokens",
      "guest_service_requests",
      "guest_ai_conversations",
      "guest_ai_handoffs",
    ],
  },
  {
    group: "Notifications",
    tables: [
      "notifications",
      "notification_deliveries",
      "notification_templates",
    ],
  },
  {
    group: "Jobs & cron",
    tables: ["job_runs", "job_locks", "cron_job_catalog"],
  },
  {
    group: "Security baseline",
    tables: [
      "auth_mfa_factors",
      "auth_mfa_recovery_codes",
      "auth_login_attempts",
      "auth_security_events",
    ],
  },
];

const TRACKED_TABLES = TRACKED_TABLE_GROUPS.flatMap((g) => g.tables);

export default async function SystemHealthPage() {
  const db = getDb();
  // 8.A.1 — single round-trip via pg_stat_user_tables. The previous
  // 39-way Promise.all of COUNT(*) saturated the postgres pool on
  // Vercel cold-start and hung the page >60s.
  const exec = db
    ? async (s: string): Promise<unknown[]> => {
        const rows = await db.execute(sql.raw(s));
        return rowsOf<unknown>(rows);
      }
    : null;
  const countMap = await getApproximateRowCounts(exec, TRACKED_TABLES);
  const counts: Array<{ table: string; result: SafeReadResult<number> }> =
    TRACKED_TABLES.map((t) => ({
      table: t,
      result: countMap.get(t) ?? {
        ok: false,
        value: 0,
        error: { queryName: t, kind: "unknown", message: "no result" },
      },
    }));
  const missing = counts.filter((c) => !c.result.ok).length;
  const okCount = counts.length - missing;
  const checklist: Array<{ label: string; ok: boolean; hint?: string }> = [
    { label: "DATABASE_URL", ok: isDbConfigured() },
    { label: "Supabase auth (URL + anon key)", ok: isSupabaseAuthConfigured() },
    { label: "CRON_SECRET", ok: Boolean(env.server.CRON_SECRET) },
    { label: "APP_BASE_URL", ok: Boolean(env.server.APP_BASE_URL) },
    {
      label: "SECURITY_ENCRYPTION_SECRET",
      ok: isSecurityEncryptionConfigured(),
      hint: "Required in production for MFA secret encryption.",
    },
    {
      label: "STAY_LINK_KMS_SECRET",
      ok: isStayLinkKmsConfigured(),
      hint: "Required in production for Wi-Fi password encryption.",
    },
    {
      label: "Notifications dry-run mode",
      ok: !isNotificationsDryRun(),
      hint: isNotificationsDryRun()
        ? "Currently dry-run. Set NOTIFICATIONS_DRY_RUN=0 to deliver."
        : undefined,
    },
    {
      label: "Backup runbook URL",
      ok: Boolean(backupRunbookUrl()),
      hint: "Set BACKUP_RUNBOOK_URL to your team's runbook.",
    },
  ];
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "System", href: "/dashboard" },
          { label: "Health" },
        ]}
        title="System health"
        description="Quick view of migration status, environment readiness, and recent table counts. Failed counts here usually mean a migration has not been applied yet."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Tables present" value={String(okCount)} />
        <MetricCard
          label="Tables missing"
          value={String(missing)}
          accent={missing > 0}
        />
        <MetricCard
          label="Env keys ready"
          value={String(checklist.filter((c) => c.ok).length)}
        />
        <MetricCard
          label="Env keys missing"
          value={String(checklist.filter((c) => !c.ok).length)}
          accent={checklist.some((c) => !c.ok)}
        />
      </div>
      <div
        className={`rounded-md border px-5 py-3 text-xs leading-relaxed ${
          missing === 0
            ? "border-success/40 bg-success-weak/30 text-success"
            : "border-warning/40 bg-warning-weak/30 text-warning"
        }`}
      >
        <div className="font-medium">
          {missing === 0
            ? "All critical modules: ready"
            : `Some modules incomplete (${missing} table${missing === 1 ? "" : "s"} missing)`}
        </div>
        <div className="mt-1">
          Each section below is one module group. A &ldquo;migration
          pending&rdquo; badge means the table doesn&rsquo;t exist yet on
          this database — contact support to apply pending migrations.
        </div>
      </div>
      {TRACKED_TABLE_GROUPS.map((group, idx) => {
        const groupCounts = counts.filter((c) =>
          group.tables.includes(c.table),
        );
        const groupOk = groupCounts.filter((c) => c.result.ok).length;
        const groupTotal = groupCounts.length;
        const allGroupOk = groupOk === groupTotal;
        return (
          <Section
            key={group.group}
            eyebrow={`${idx + 1}`}
            title={group.group}
            description={`${groupOk}/${groupTotal} tables present.`}
            action={
              <Badge tone={allGroupOk ? "success" : "warning"}>
                {allGroupOk ? "ready" : "incomplete"}
              </Badge>
            }
          >
            <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-canvas/50 text-left">
                  <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                    <th className="px-4 py-3">Table</th>
                    <th className="px-4 py-3">Rows</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {groupCounts.map(({ table, result }) => (
                    <tr key={table} className="border-t border-line-soft">
                      <td className="px-4 py-3 font-mono text-xs">{table}</td>
                      <td className="px-4 py-3 text-xs">
                        {result.ok ? result.value : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {result.ok ? (
                          <Badge tone="success">present</Badge>
                        ) : result.error?.kind === "missing_relation" ? (
                          <Badge tone="warning">migration pending</Badge>
                        ) : result.error?.kind === "no_db" ? (
                          <Badge tone="neutral">no db</Badge>
                        ) : (
                          <Badge tone="danger">error</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                        {result.ok
                          ? ""
                          : result.error?.kind === "missing_relation"
                            ? `Apply migration that creates "${table}".`
                            : result.error?.message ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
      <Section eyebrow="Environment" title="Readiness checklist">
        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {checklist.map((c) => (
            <li
              key={c.label}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm text-ink">{c.label}</div>
                {c.hint && (
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {c.hint}
                  </div>
                )}
              </div>
              <Badge tone={c.ok ? "success" : "warning"}>
                {c.ok ? "ready" : "missing"}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>
      {backupRunbookUrl() && (
        <p className="text-xs text-ink-tertiary">
          Backup / restore runbook:{" "}
          <a
            href={backupRunbookUrl() ?? "#"}
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            {backupRunbookUrl()}
          </a>
        </p>
      )}
    </div>
  );
}
