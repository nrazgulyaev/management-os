import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Security" },
        ]}
        title="Security"
        description="Verification flow, rate-limit hits, suspicious access, lock-code reveals, Wi-Fi reveals — everything that needs eyes on it."
      />
      <QueryWarningCard result={highCountResult} tableName="guest_stay_security_events" />
      <QueryWarningCard result={recentResult} tableName="guest_stay_security_events" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="High-sev (24h)"
          value={String(highCount)}
          accent={highCount > 0}
        />
        <MetricCard
          label="Encryption"
          value={kmsReady ? "Active" : "Dev fallback"}
          hint={
            kmsReady
              ? "STAY_LINK_KMS_SECRET set"
              : "Set STAY_LINK_KMS_SECRET before production"
          }
        />
        <MetricCard label="Last 25 events" value={String(recent.length)} />
      </div>
      <Section eyebrow="Surfaces" title="Jump to">
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
      </Section>
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
      className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
