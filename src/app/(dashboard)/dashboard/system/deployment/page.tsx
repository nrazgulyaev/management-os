import Link from "next/link";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getEnvReadinessReport } from "@/lib/env/validation";
import { getProductionGateReport } from "@/lib/deployment/production-gates";
import { backupRunbookUrl } from "@/lib/env";

export const metadata = { title: "Deployment readiness" };
export const dynamic = "force-dynamic";

export default async function DeploymentReadinessPage() {
  const env = getEnvReadinessReport();
  const gates = getProductionGateReport();

  // Static migration count from drizzle/.
  let migrationCount = 0;
  let lastMigration: string | null = null;
  const drizzleDir = join(process.cwd(), "drizzle");
  if (existsSync(drizzleDir)) {
    const sqls = readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
      .sort();
    migrationCount = sqls.length;
    lastMigration = sqls[sqls.length - 1] ?? null;
  }

  // Static cron route count.
  let cronRouteCount = 0;
  const cronDir = join(process.cwd(), "src/app/api/cron");
  if (existsSync(cronDir)) {
    cronRouteCount = readdirSync(cronDir).filter((f) =>
      existsSync(join(cronDir, f, "route.ts")),
    ).length;
  }

  const fatals = env.items.filter((i) => i.status === "fatal");
  const warnings = env.items.filter((i) => i.status === "warning");

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">System</Link> /{" "}
            <span>Deployment readiness</span>
          </div>
          <h1>Deployment readiness</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`Mode: ${env.mode}. Run \`npm run preflight:deploy\` before promoting a build to staging or production.`}
          </p>
        </div>
      </div>

      <div
        className={`rounded-md border px-5 py-4 leading-relaxed text-sm ${
          gates.ok && env.fatalCount === 0
            ? "border-success/40 bg-success-weak/30 text-success"
            : "border-danger/40 bg-danger-weak/30 text-danger"
        }`}
      >
        <div className="font-medium">
          {gates.ok && env.fatalCount === 0
            ? "Go for staging promotion."
            : "No-go — resolve the failing items below."}
        </div>
        <div className="mt-1 text-xs">
          {gates.ok && env.fatalCount === 0
            ? "All production gates and env keys passed. Walk through docs/STAGING-LAUNCH-CHECKLIST.md for the manual smoke test before promoting."
            : "Production cannot be promoted until every fatal env item and every failed production gate is green."}
        </div>
        <div className="mt-3 text-xs">
          Runbooks live in the repo —{" "}
          <span className="font-mono">docs/STAGING-LAUNCH-CHECKLIST.md</span>,{" "}
          <span className="font-mono">docs/DEPLOYMENT-RUNBOOK.md</span>,{" "}
          <span className="font-mono">
            docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md
          </span>
          .
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Env mode" value={env.mode} />
        <Kpi
          label="Env fatal"
          value={String(env.fatalCount)}
          tone={env.fatalCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Env warnings"
          value={String(env.warningCount)}
          tone={env.warningCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Production gates"
          value={gates.ok ? "OK" : "Failed"}
          tone={!gates.ok ? "accent" : undefined}
        />
      </div>

      <div>
        <div className="label mb-2.5">
          Env readiness — {env.fatalCount} fatal · {env.warningCount} warning
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Values are redacted. Public NEXT_PUBLIC_* keys are shown in full when
          set.
        </p>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Value</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {env.items.map((i) => (
                <tr key={i.key}>
                  <td className="mono text-xs">{i.key}</td>
                  <td className="text-xs">{i.category}</td>
                  <td>
                    <HandoffBadge
                      tone={
                        i.status === "fatal"
                          ? "danger"
                          : i.status === "warning"
                            ? "warn"
                            : i.status === "not_required"
                              ? "soft"
                              : "ok"
                      }
                    >
                      {i.status}
                    </HandoffBadge>
                  </td>
                  <td className="mono text-[11px] text-ink-tertiary">
                    {i.redactedValue ?? "—"}
                  </td>
                  <td className="text-[11px] text-ink-secondary">
                    {i.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">
          Production gates — {gates.results.length} gate(s) —{" "}
          {gates.ok ? "OK" : "FAILED"}
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Gates only fire in staging / production. In development they always
          pass.
        </p>
        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {gates.results.map((g) => (
            <li
              key={g.key}
              className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="text-sm text-ink">{g.key.replace(/_/g, " ")}</div>
                <div className="text-ink-tertiary mt-0.5">{g.message}</div>
              </div>
              <HandoffBadge
                tone={
                  g.ok
                    ? "ok"
                    : g.severity === "critical"
                      ? "danger"
                      : "warn"
                }
              >
                {g.ok ? "ok" : g.severity}
              </HandoffBadge>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="label mb-2.5">Supabase</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Pending migrations are applied automatically on each deploy. Contact
          support if a migration is missing in production.
        </p>
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <Stat label="Migration count" value={String(migrationCount)} />
          <Stat label="Last migration" value={lastMigration ?? "—"} />
          <Stat
            label="Database URL"
            value={process.env.DATABASE_URL ? "set" : "missing"}
          />
        </div>
        <Link
          href="#"
          onClick={undefined}
          className="text-xs text-ink hover:underline underline-offset-4"
        >
          See <code>docs/SUPABASE-PROVISIONING-CHECKLIST.md</code>
        </Link>
      </div>

      <div>
        <div className="label mb-2.5">Storage</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          See `docs/STORAGE-BUCKETS-CHECKLIST.md` for privacy rules + cleanup
          jobs.
        </p>
        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft text-xs">
          <li className="px-4 py-3 flex justify-between">
            <span>task-attachments</span>
            <HandoffBadge tone="warn">private · signed URL only</HandoffBadge>
          </li>
          <li className="px-4 py-3 flex justify-between">
            <span>guest-request-attachments</span>
            <HandoffBadge tone="warn">private · signed URL · cleanup cron</HandoffBadge>
          </li>
        </ul>
      </div>

      <div>
        <div className="label mb-2.5">Cron — {cronRouteCount} cron route(s)</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          See `docs/VERCEL-CRON-CHECKLIST.md` for schedules + Vercel setup.
        </p>
        <Card padding="default">
          <p className="text-xs text-ink-tertiary m-0">
            {process.env.CRON_SECRET
              ? "CRON_SECRET is set — all routes accept Vercel Cron requests."
              : "CRON_SECRET missing — cron routes will deny every request in production."}
          </p>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Demo vs production</div>
        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft text-xs">
          <li className="px-4 py-3 flex justify-between">
            <span>ARCONIQUE_FORCE_MOCK</span>
            <HandoffBadge tone={process.env.ARCONIQUE_FORCE_MOCK === "1" ? "warn" : "soft"}>
              {process.env.ARCONIQUE_FORCE_MOCK === "1" ? "ON" : "off"}
            </HandoffBadge>
          </li>
          <li className="px-4 py-3 flex justify-between">
            <span>NEXT_PUBLIC_ENABLE_DEMO_MODE</span>
            <HandoffBadge
              tone={
                process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "1"
                  ? "warn"
                  : "soft"
              }
            >
              {process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "1" ? "ON" : "off"}
            </HandoffBadge>
          </li>
        </ul>
        <p className="text-xs text-ink-tertiary">
          Production deployments must keep both flags off.  See{" "}
          <code>docs/PRODUCTION-SEED-STRATEGY.md</code>.
        </p>
      </div>

      {fatals.length > 0 && (
        <p className="rounded-md border border-danger/40 bg-danger-weak text-danger p-3 text-xs">
          {fatals.length} fatal env issue(s).  Fix before deploying.
        </p>
      )}
      {warnings.length > 0 && fatals.length === 0 && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          {warnings.length} warning(s) — review before deploying to production.
        </p>
      )}

      <p className="text-xs text-ink-tertiary">
        Last preflight run: not tracked.  Run{" "}
        <code>npm run preflight:deploy</code> from your CI runner before
        promotion.
        {backupRunbookUrl() && (
          <>
            {" "}
            Backup runbook:{" "}
            <a className="underline" href={backupRunbookUrl()!} target="_blank" rel="noreferrer">
              link
            </a>
            .
          </>
        )}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-sm text-ink mt-1 font-mono">{value}</div>
    </div>
  );
}
