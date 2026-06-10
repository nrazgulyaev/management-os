import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { TableEmpty } from "@/components/ui/table-empty";
import { listJobLocks } from "@/features/jobs/locks";
import { safeList } from "@/features/system/db-health";
import {
  ExpireStaleLocksButton,
  ForceReleaseLockButton,
} from "@/components/security/job-lock-buttons";

export const metadata = { title: "Job locks" };
export const dynamic = "force-dynamic";

export default async function JobLocksAdminPage() {
  const locks = await safeList("job_locks.list", () => listJobLocks());
  const now = new Date();
  const lockedCount = locks.value.filter((l) => l.status === "locked").length;
  const staleCount = locks.value.filter((l) => {
    const expiresAt = l.expiresAt as unknown as Date;
    return (
      l.status === "locked" && expiresAt instanceof Date && expiresAt < now
    );
  }).length;
  const expiredCount = locks.value.filter((l) => l.status === "expired").length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/jobs">Jobs</Link> / <span>Locks</span>
          </div>
          <h1>Job locks</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            One row per job_key — only one cron worker holds the lock at a
            time. Stale locks (expired without release) are picked up by the
            next worker; force-release here if a job is stuck.
          </p>
        </div>
        <div className="actions">
          <ExpireStaleLocksButton />
        </div>
      </div>

      {!locks.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs mb-[18px]">
          {locks.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load locks: ${locks.error?.message}`}
        </p>
      )}

      <div className="gs-kpis">
        <Kpi label="Locks" value={String(locks.value.length)} sub="on file" />
        <Kpi
          label="Held"
          value={String(lockedCount)}
          tone={lockedCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Stale"
          value={String(staleCount)}
          tone={staleCount > 0 ? "warn" : undefined}
        />
        <Kpi label="Expired" value={String(expiredCount)} />
      </div>

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Job key</th>
              <th scope="col">Status</th>
              <th scope="col">Held by</th>
              <th scope="col">Locked at</th>
              <th scope="col">Expires</th>
              <th scope="col">Released</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {locks.value.length === 0 ? (
              <TableEmpty colSpan={7}>No locks recorded.</TableEmpty>
            ) : (
              locks.value.map((l) => {
                const expiresAt = l.expiresAt as unknown as Date;
                const stale =
                  l.status === "locked" &&
                  expiresAt instanceof Date &&
                  expiresAt < now;
                return (
                  <tr key={l.id}>
                    <td className="mono text-[11px]">{l.jobKey}</td>
                    <td>
                      <span
                        className={`badge ${
                          l.status === "locked"
                            ? stale
                              ? "badge-warn"
                              : "badge-info"
                            : l.status === "expired"
                              ? "badge-warn"
                              : "badge-soft"
                        }`}
                      >
                        {stale ? "stale" : l.status}
                      </span>
                    </td>
                    <td className="mono text-[11px] text-ink-4">
                      {l.lockedBy}
                    </td>
                    <td className="mono text-[11px] text-ink-4">
                      {(l.lockedAt as unknown as Date)
                        ?.toISOString?.()
                        .slice(0, 16)
                        .replace("T", " ") ?? ""}
                    </td>
                    <td className="mono text-[11px] text-ink-4">
                      {expiresAt instanceof Date
                        ? expiresAt.toISOString().slice(0, 16).replace("T", " ")
                        : ""}
                    </td>
                    <td className="mono text-[11px] text-ink-4">
                      {l.releasedAt instanceof Date
                        ? l.releasedAt
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")
                        : "—"}
                    </td>
                    <td>
                      {l.status === "locked" && (
                        <ForceReleaseLockButton jobKey={l.jobKey} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
