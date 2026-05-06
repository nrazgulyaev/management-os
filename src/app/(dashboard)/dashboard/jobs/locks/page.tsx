import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Jobs", href: "/dashboard/jobs" },
          { label: "Locks" },
        ]}
        title="Job locks"
        description="One row per job_key — only one cron worker holds the lock at a time. Stale locks (expired without release) are picked up by the next worker; force-release here if a job is stuck."
        actions={<ExpireStaleLocksButton />}
      />
      {!locks.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          {locks.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load locks: ${locks.error?.message}`}
        </p>
      )}
      <Section eyebrow="Locks" title={`${locks.value.length} on file`}>
        {locks.value.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No locks recorded.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Job key</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Held by</th>
                  <th className="px-4 py-3">Locked at</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Released</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {locks.value.map((l) => {
                  const expiresAt = l.expiresAt as unknown as Date;
                  const stale =
                    l.status === "locked" &&
                    expiresAt instanceof Date &&
                    expiresAt < now;
                  return (
                    <tr key={l.id} className="border-t border-line-soft">
                      <td className="px-4 py-3 font-mono text-xs">
                        {l.jobKey}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            l.status === "locked"
                              ? stale
                                ? "warning"
                                : "info"
                              : l.status === "expired"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {stale ? "stale" : l.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                        {l.lockedBy}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                        {(l.lockedAt as unknown as Date)
                          ?.toISOString?.()
                          .slice(0, 16)
                          .replace("T", " ") ?? ""}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                        {expiresAt instanceof Date
                          ? expiresAt.toISOString().slice(0, 16).replace("T", " ")
                          : ""}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                        {l.releasedAt instanceof Date
                          ? l.releasedAt.toISOString().slice(0, 16).replace("T", " ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {l.status === "locked" && (
                          <ForceReleaseLockButton jobKey={l.jobKey} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
