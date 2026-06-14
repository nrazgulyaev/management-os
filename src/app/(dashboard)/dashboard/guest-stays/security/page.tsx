import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import {
  countOpenHighSeverityEvents,
  listSecurityEvents,
} from "@/features/guest-stays/security";
import { isStayLinkKmsConfigured } from "@/lib/env";
import { safeCount, safeList } from "@/features/system/db-health";
import { QueryWarningCard } from "@/components/system/query-warning-card";

export const metadata = { title: "Guest stay security" };
export const dynamic = "force-dynamic";

export default async function SecurityHub() {
  const [highCountResult, recentResult] = await Promise.all([
    safeCount("guest_stay_security_events.high_24h", () =>
      countOpenHighSeverityEvents(24),
    ),
    safeList("guest_stay_security_events.recent", () =>
      listSecurityEvents({ limit: 25 }),
    ),
  ]);
  const highCount = highCountResult.value;
  const recent = recentResult.value;
  const kmsReady = isStayLinkKmsConfigured();
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <span>Security</span>
          </div>
          <h1>Security</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Verification flow, rate-limit hits, suspicious access, lock-code
            reveals, Wi-Fi reveals — everything that needs eyes on it.
          </p>
        </div>
      </div>
      <QueryWarningCard result={highCountResult} tableName="guest_stay_security_events" />
      <QueryWarningCard result={recentResult} tableName="guest_stay_security_events" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="High-sev (24h)"
          value={String(highCount)}
          tone={highCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Encryption"
          value={kmsReady ? "Active" : "Dev fallback"}
          sub={
            kmsReady
              ? "STAY_LINK_KMS_SECRET set"
              : "Set STAY_LINK_KMS_SECRET before production"
          }
        />
        <Kpi label="Last 25 events" value={String(recent.length)} />
      </div>
      <div>
        <div className="label mb-2.5">Surfaces</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card
            href="/dashboard/guest-stays/security/events"
            title="Security events"
            detail="Verification, rate limits, suspicious access"
          />
          <Card
            href="/dashboard/guest-stays/security/verifications"
            title="Verifications"
            detail="Pending + recent one-time-code attempts"
          />
          <Card
            href="/dashboard/villa-guides/wifi"
            title="Wi-Fi credentials"
            detail="Encrypted at rest — manage rotation per row"
          />
          <Card
            href="/dashboard/villa-guides/wifi/migrate"
            title="Migrate plaintext Wi-Fi"
            detail="Run the AES sweep against legacy rows"
          />
        </div>
      </div>
    </div>
  );
}

function Card({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
