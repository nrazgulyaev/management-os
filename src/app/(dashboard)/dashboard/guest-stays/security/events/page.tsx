import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import {
  listSecurityEvents,
  type SecurityEventSeverity,
} from "@/features/guest-stays/security";

export const metadata = { title: "Guest stay security events" };
export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<
  SecurityEventSeverity,
  "soft" | "info" | "warn" | "danger"
> = {
  low: "soft",
  medium: "info",
  high: "warn",
  critical: "danger",
};

export default async function SecurityEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const sp = await searchParams;
  const severity =
    sp.severity === "low" ||
    sp.severity === "medium" ||
    sp.severity === "high" ||
    sp.severity === "critical"
      ? (sp.severity as SecurityEventSeverity)
      : undefined;
  const rows = await listSecurityEvents({ severity, limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-stays/security">Security</Link> /{" "}
            <span>Events</span>
          </div>
          <h1>Security events</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Append-only log. Filter by severity. Verification, rate limits, lock
            + Wi-Fi reveals all flow through here.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Filter</div>
        <div className="flex gap-2 mb-4">
          <FilterPill
            href="/dashboard/guest-stays/security/events"
            active={!severity}
          >
            All
          </FilterPill>
          {(["low", "medium", "high", "critical"] as const).map((s) => (
            <FilterPill
              key={s}
              href={`/dashboard/guest-stays/security/events?severity=${s}`}
              active={severity === s}
            >
              {s}
            </FilterPill>
          ))}
        </div>
        <div className="card p-0 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Type</th>
                <th scope="col">Severity</th>
                <th scope="col">Token</th>
                <th scope="col">IP hash</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-ink-3">
                    No events match.
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-[12px] text-ink-3">
                    {new Date(e.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="mono text-[12px]">{e.eventType}</td>
                  <td>
                    <HandoffBadge
                      tone={SEVERITY_TONES[e.severity as SecurityEventSeverity]}
                    >
                      {e.severity}
                    </HandoffBadge>
                  </td>
                  <td className="mono text-[12px] text-ink-3">
                    {e.tokenPrefix ? `${e.tokenPrefix}…` : "—"}
                  </td>
                  <td className="mono text-[12px] text-ink-3">
                    {e.ipHash ?? "—"}
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {e.metadata
                      ? truncateJson(JSON.stringify(e.metadata))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function truncateJson(s: string): string {
  if (s.length <= 80) return s;
  return s.slice(0, 80) + "…";
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active ? "btn btn-accent btn-sm" : "btn btn-secondary btn-sm"
      }
    >
      {children}
    </Link>
  );
}
