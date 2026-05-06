import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listSecurityEvents,
  type SecurityEventSeverity,
} from "@/features/guest-stays/security";

export const metadata = { title: "Guest stay security events" };
export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<
  SecurityEventSeverity,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
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
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Security", href: "/dashboard/guest-stays/security" },
          { label: "Events" },
        ]}
        title="Security events"
        description="Append-only log. Filter by severity. Verification, rate limits, lock + Wi-Fi reveals all flow through here."
      />
      <Section eyebrow="Filter" title={`${rows.length} events`}>
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
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">IP hash</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No events match.
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums whitespace-nowrap">
                    {new Date(e.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.eventType}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={SEVERITY_TONES[e.severity as SecurityEventSeverity]}
                    >
                      {e.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {e.tokenPrefix ? `${e.tokenPrefix}…` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {e.ipHash ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-secondary">
                    {e.metadata
                      ? truncateJson(JSON.stringify(e.metadata))
                      : "—"}
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
      className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
        active
          ? "bg-ink text-ink-inverse"
          : "border border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}
