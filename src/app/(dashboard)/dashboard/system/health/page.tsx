import Link from "next/link";
import { sql } from "drizzle-orm";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
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
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

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
  // Platform-ops gate (super_admin / director). The pg_stat_user_tables
  // catalog stat below is cross-tenant by nature and cannot be org-filtered,
  // so only platform operators may reach this page.
  const { allowed } = await requireCabinetAccess("system");
  if (!allowed) return <CabinetGate cabinet="System" />;
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">System</Link> /{" "}
            <span>Health</span>
          </div>
          <h1>System health</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Quick view of migration status, environment readiness, and recent
            table counts. Failed counts here usually mean a migration has not
            been applied yet.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Tables present" value={String(okCount)} />
        <Kpi
          label="Tables missing"
          value={String(missing)}
          tone={missing > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Env keys ready"
          value={String(checklist.filter((c) => c.ok).length)}
        />
        <Kpi
          label="Env keys missing"
          value={String(checklist.filter((c) => !c.ok).length)}
          tone={checklist.some((c) => !c.ok) ? "accent" : undefined}
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
          <div key={group.group}>
            <div className="flex items-center gap-3 mb-2.5">
              <div className="label flex-1 min-w-0">
                {idx + 1}. {group.group} — {groupOk}/{groupTotal} tables present.
              </div>
              <HandoffBadge tone={allGroupOk ? "ok" : "warn"}>
                {allGroupOk ? "ready" : "incomplete"}
              </HandoffBadge>
            </div>
            <Card padding="none" overflowHidden>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Table</th>
                    <th scope="col" className="num">Rows</th>
                    <th scope="col">Status</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {groupCounts.map(({ table, result }) => (
                    <tr key={table}>
                      <td className="mono text-xs">{table}</td>
                      <td className="num text-xs">
                        {result.ok ? result.value : "—"}
                      </td>
                      <td>
                        {result.ok ? (
                          <HandoffBadge tone="ok">present</HandoffBadge>
                        ) : result.error?.kind === "missing_relation" ? (
                          <HandoffBadge tone="warn">migration pending</HandoffBadge>
                        ) : result.error?.kind === "no_db" ? (
                          <HandoffBadge tone="soft">no db</HandoffBadge>
                        ) : (
                          <HandoffBadge tone="danger">error</HandoffBadge>
                        )}
                      </td>
                      <td className="text-[11px] text-ink-tertiary">
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
            </Card>
          </div>
        );
      })}
      <div>
        <div className="label mb-2.5">Environment</div>
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
              <HandoffBadge tone={c.ok ? "ok" : "warn"}>
                {c.ok ? "ready" : "missing"}
              </HandoffBadge>
            </li>
          ))}
        </ul>
      </div>
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
