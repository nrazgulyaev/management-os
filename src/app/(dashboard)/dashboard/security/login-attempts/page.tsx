import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { TableEmpty } from "@/components/ui/table-empty";
import {
  listActiveLoginLocks,
  listRecentLoginAttempts,
} from "@/features/security-baseline/login-throttle";
import { safeList } from "@/features/system/db-health";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Login attempts" };
export const dynamic = "force-dynamic";

export default async function LoginAttemptsPage() {
  const { allowed } = await requireCabinetAccess("security");
  if (!allowed) return <CabinetGate cabinet="Security" />;
  const attempts = await safeList("login.attempts", () =>
    listRecentLoginAttempts(200),
  );
  const locks = await safeList("login.locks", () => listActiveLoginLocks());
  const failedAttempts = attempts.value.filter((a) => !a.succeeded).length;
  const successfulAttempts = attempts.value.filter((a) => a.succeeded).length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/security">Security</Link> /{" "}
            <Link href="/dashboard/security/auth">Authentication</Link> /{" "}
            <span>Login attempts</span>
          </div>
          <h1>Login attempts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Most recent server-side login attempts. IP and user-agent are
            stored as salted SHA-256 hashes — raw values never persist.
          </p>
        </div>
      </div>

      {!attempts.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs mb-[18px]">
          {attempts.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load attempts: ${attempts.error?.message}`}
        </p>
      )}

      <div className="gs-kpis">
        <Kpi
          label="Attempts"
          value={String(attempts.value.length)}
          sub="on file"
        />
        <Kpi
          label="Failed"
          value={String(failedAttempts)}
          tone={failedAttempts > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Successful"
          value={String(successfulAttempts)}
          tone={successfulAttempts > 0 ? "success" : undefined}
        />
        <Kpi
          label="Active locks"
          value={String(locks.value.length)}
          tone={locks.value.length > 0 ? "danger" : undefined}
        />
      </div>

      <div className="card card-pad mb-[18px]">
        <div className="gs-card-h">
          <h3>Active locks</h3>
          <span className="meta">{locks.value.length} ACTIVE</span>
        </div>
        {locks.value.length === 0 ? (
          <p className="text-[13px] text-ink-3 m-0">No active locks.</p>
        ) : (
          <ul className="clean">
            {locks.value.map((l, i) => (
              <li
                key={`${l.emailNormalized ?? "ip"}-${i}`}
                className="flex items-center justify-between gap-4"
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-[13px] text-ink truncate">
                    {l.emailNormalized ?? `IP ${l.ipHash?.slice(0, 8) ?? "?"}…`}
                  </span>
                  <span className="mono text-[10.5px] text-ink-4">
                    Locked until {l.lockedUntil.slice(0, 16).replace("T", " ")}
                  </span>
                </span>
                <span className="badge badge-warn">locked</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Email</th>
              <th scope="col">Outcome</th>
              <th scope="col">Reason</th>
              <th scope="col">IP hash</th>
              <th scope="col">Locked until</th>
            </tr>
          </thead>
          <tbody>
            {attempts.value.length === 0 ? (
              <TableEmpty colSpan={6}>No login attempts on file.</TableEmpty>
            ) : (
              attempts.value.map((a) => (
                <tr key={a.id}>
                  <td className="mono text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
                    {a.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="text-[12px]">{a.emailNormalized ?? "—"}</td>
                  <td>
                    <span
                      className={`badge ${a.succeeded ? "badge-ok" : "badge-warn"}`}
                    >
                      {a.succeeded ? "ok" : "failed"}
                    </span>
                  </td>
                  <td className="text-[11px] text-ink-4">
                    {a.failureReason ?? ""}
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {a.ipHash ? `${a.ipHash.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {a.lockedUntil
                      ? a.lockedUntil.slice(0, 16).replace("T", " ")
                      : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
