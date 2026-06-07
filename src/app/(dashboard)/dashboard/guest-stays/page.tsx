import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listGuestStayTokens } from "@/features/guest-stays/services";
import {
  listSecurityEvents,
  countOpenHighSeverityEvents,
  type SecurityEventSeverity,
} from "@/features/guest-stays/security";

export const metadata = { title: "Guest stays" };
export const dynamic = "force-dynamic";

const TOKEN_TONE: Record<
  string,
  "neutral" | "success" | "danger" | "warning" | "info"
> = {
  active: "success",
  revoked: "danger",
  expired: "warning",
  completed: "neutral",
  pending: "info",
};

const SEVERITY_TONES: Record<
  SecurityEventSeverity,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

function fmtDateTime(iso: string | Date | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function truncateJson(s: string): string {
  return s.length <= 70 ? s : s.slice(0, 70) + "…";
}

export default async function GuestStaysHub() {
  const [recent, active, revoked, securityEvents, highAlerts] = await Promise.all([
    listGuestStayTokens({ limit: 40 }),
    listGuestStayTokens({ status: "active", limit: 200 }),
    listGuestStayTokens({ status: "revoked", limit: 200 }),
    listSecurityEvents({ limit: 200 }),
    countOpenHighSeverityEvents(24),
  ]);

  const villaCount = new Set(active.map((t) => t.villaCode).filter(Boolean)).size;
  const portalAccesses = active.reduce((s, t) => s + (t.accessCount ?? 0), 0);
  const since24 = Date.now() - 24 * 60 * 60 * 1000;
  const events24h = securityEvents.filter(
    (e) => new Date(e.createdAt).getTime() >= since24,
  ).length;
  const recentEvents = securityEvents.slice(0, 12);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Guest stays</span>
          </div>
          <h1>Guest stays</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {active.length} active token{active.length === 1 ? "" : "s"} ·{" "}
            {villaCount} villa{villaCount === 1 ? "" : "s"}. One signed token per
            booking — verifies via 6-digit code, reveals door + Wi-Fi on tap,
            never a raw booking ID in a public URL.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/guest-stays/security/events"
            className="btn btn-secondary btn-sm"
          >
            Security events →
          </Link>
          <Link
            href="/dashboard/guest-stays/tokens"
            className="btn btn-accent btn-sm"
          >
            Manage tokens →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Active tokens"
          value={String(active.length)}
          sub={`across ${villaCount} villa${villaCount === 1 ? "" : "s"}`}
          tone={active.length > 0 ? "success" : undefined}
        />
        <Kpi label="Revoked" value={String(revoked.length)} sub="all-time" />
        <Kpi
          label="Portal accesses"
          value={String(portalAccesses)}
          sub="guest opens · active tokens"
        />
        <Kpi label="Security events · 24h" value={String(events24h)} sub="append-only log" />
        <Kpi
          label="High-severity"
          value={String(highAlerts)}
          sub={highAlerts > 0 ? "needs review · 24h" : "all clear · 24h"}
          tone={highAlerts > 0 ? "accent" : undefined}
        />
      </div>

      <DbStatusNotice />

      {/* Active tokens */}
      <h2 className="display text-[22px] font-normal mt-2 mb-3.5" id="tokens">
        Tokens · recent
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Booking</th>
              <th scope="col">Guest</th>
              <th scope="col">Villa</th>
              <th scope="col">Project</th>
              <th scope="col">Accesses</th>
              <th scope="col">Status</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <TableEmpty colSpan={8}>No tokens issued yet. Issue one from a booking.</TableEmpty>
            ) : (
              recent.map((t) => (
                <tr key={t.id}>
                  <td className="mono text-[11px] text-ink-3">{t.tokenPrefix}…</td>
                  <td className="mono text-[11px]">{t.bookingCode ?? "—"}</td>
                  <td>{t.issuedToEmail ?? t.issuedToPhone ?? "—"}</td>
                  <td className="mono">{t.villaCode ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{t.projectName ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">
                    {t.accessCount}
                    {t.lastAccessedAt ? ` · ${fmtDateTime(t.lastAccessedAt)}` : ""}
                  </td>
                  <td>
                    <Badge tone={TOKEN_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/guest-stays/tokens/${t.id}`}
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Security events */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="security">
        Security events · <em>recent</em>
      </h2>
      <div className="card p-0 overflow-hidden">
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
            {recentEvents.length === 0 ? (
              <TableEmpty colSpan={6}>No security events logged. Verifications, rate limits and
                  lock / Wi-Fi reveals all surface here.</TableEmpty>
            ) : (
              recentEvents.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(e.createdAt)}
                  </td>
                  <td className="mono text-[12px]">{e.eventType}</td>
                  <td>
                    <Badge tone={SEVERITY_TONES[e.severity as SecurityEventSeverity] ?? "neutral"}>
                      {e.severity}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {e.tokenPrefix ? `${e.tokenPrefix}…` : "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-3">{e.ipHash ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">
                    {e.metadata ? truncateJson(JSON.stringify(e.metadata)) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Related surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {[
          { href: "/dashboard/guest-stays/tokens", title: "Tokens", detail: `${active.length} active` },
          { href: "/dashboard/villa-guides/sections", title: "Villa guides", detail: "Check-in, rules, amenities" },
          { href: "/dashboard/guest-services", title: "Guest services", detail: "Catalog, orders, finance bridge" },
          { href: "/dashboard/guest-stays/security/verifications", title: "Verifications", detail: "6-digit code log" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
