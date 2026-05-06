import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listActiveLoginLocks,
  listRecentLoginAttempts,
} from "@/features/security-baseline/login-throttle";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Login attempts" };
export const dynamic = "force-dynamic";

export default async function LoginAttemptsPage() {
  const attempts = await safeList("login.attempts", () =>
    listRecentLoginAttempts(200),
  );
  const locks = await safeList("login.locks", () => listActiveLoginLocks());
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Security", href: "/dashboard/security" },
          { label: "Authentication", href: "/dashboard/security/auth" },
          { label: "Login attempts" },
        ]}
        title="Login attempts"
        description="Most recent server-side login attempts. IP and user-agent are stored as salted SHA-256 hashes — raw values never persist."
      />
      {!attempts.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          {attempts.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load attempts: ${attempts.error?.message}`}
        </p>
      )}
      <Section
        eyebrow="Active locks"
        title={`${locks.value.length} active`}
      >
        {locks.value.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No active locks.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {locks.value.map((l, i) => (
              <li
                key={`${l.emailNormalized ?? "ip"}-${i}`}
                className="px-4 py-3 flex items-center justify-between gap-4 text-xs"
              >
                <div>
                  <div className="text-sm text-ink">
                    {l.emailNormalized ?? `IP ${l.ipHash?.slice(0, 8) ?? "?"}…`}
                  </div>
                  <div className="text-ink-tertiary mt-0.5">
                    Locked until {l.lockedUntil.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <Badge tone="warning">locked</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section
        eyebrow="Recent attempts"
        title={`${attempts.value.length} on file`}
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">IP hash</th>
                <th className="px-4 py-3">Locked until</th>
              </tr>
            </thead>
            <tbody>
              {attempts.value.map((a) => (
                <tr key={a.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {a.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.emailNormalized ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={a.succeeded ? "success" : "warning"}>
                      {a.succeeded ? "ok" : "failed"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {a.failureReason ?? ""}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {a.ipHash ? `${a.ipHash.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {a.lockedUntil
                      ? a.lockedUntil.slice(0, 16).replace("T", " ")
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
