import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerHome } from "@/features/owner-portal/get-home";
import { OwnerGreeting } from "@/components/owner-portal/owner-greeting";
import { HeroTile } from "@/components/owner-portal/hero-tile";
import { VillaCard } from "@/components/owner-portal/villa-card";
import { UpcomingList } from "@/components/owner-portal/upcoming-list";
import { OwnerQuickActions } from "@/components/owner-portal/owner-quick-actions";
import type { OwnerVillaOption } from "@/features/owner-portal/engagement-types";

/**
 * Sprint OWNER-PORTAL-1A · redesign owner-01 — Owner home.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/01-home.html. Wires the
 * Phase 2.3 owner-portal presentational primitives (OwnerGreeting / HeroTile /
 * VillaCard / UpcomingList / QuickActionGrid) to the live `getOwnerHome`
 * aggregate. Layout per the prototype's "Where this lands" spec:
 *   greeting → 3-tile hero (YTD / Pending / Next) → villa card(s)
 *            → upcoming (14d) → quick actions.
 */

export const metadata = { title: "Your portfolio" };
export const dynamic = "force-dynamic";

function fmtUsd(usd: number): string {
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (Math.abs(usd) >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .toUpperCase();
}

function SectionHead({
  title,
  href,
  link,
}: {
  title: string;
  href: string;
  link: string;
}) {
  return (
    <div className="owner-sec-head">
      <h2 className="owner-sec-title">{title}</h2>
      <Link href={href} className="owner-sec-link">
        {link}
      </Link>
    </div>
  );
}

export default async function OwnerHomePage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const home = await getOwnerHome(owner.ownerId);

  const year = new Date().getFullYear();
  const eyebrow = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase();

  const upcomingCount = home.upcoming.length;
  const narrative = home.pendingStatement ? (
    <>
      Your <strong>{home.pendingStatement.periodLabel}</strong> statement is ready
      for your review — net <strong>{fmtUsd(home.pendingStatement.netUsd)}</strong>.
      {upcomingCount > 0
        ? ` ${upcomingCount} arrival${upcomingCount === 1 ? "" : "s"} over the next 14 days.`
        : ""}
    </>
  ) : home.ytdNetUsd > 0 ? (
    <>
      You&rsquo;re all caught up. Your villas have paid out{" "}
      <strong>{fmtUsd(home.ytdNetUsd)}</strong> so far in {year}.
      {upcomingCount > 0
        ? ` ${upcomingCount} upcoming over the next 14 days.`
        : ""}
    </>
  ) : (
    <>
      Welcome to your portfolio. Your first statement will appear here once your
      operator generates it.
    </>
  );

  const villaOptions: OwnerVillaOption[] = home.villas.map((v) => ({
    id: v.id,
    label: v.code && v.code !== "—" ? `${v.code} · ${v.name}` : v.name,
  }));

  return (
    <div className="flex flex-col gap-10">
      <OwnerGreeting
        ownerName={owner.ownerName}
        eyebrow={eyebrow}
        narrative={narrative}
      />

      {/* 3-tile hero — YTD net / pending review / next statement */}
      <div className="hero-grid">
        <HeroTile
          variant="dark"
          label={`YTD net · ${year}`}
          value={home.ytdNetUsd > 0 ? fmtUsd(home.ytdNetUsd) : "—"}
          sub="Net to you · across your villas"
          foot="Wired monthly"
        />
        {home.pendingStatement ? (
          <HeroTile
            variant="flat"
            className="gold"
            label="Pending review"
            value={home.pendingStatement.periodLabel}
            sub={`${home.pendingStatement.statementCode} · ${fmtUsd(home.pendingStatement.netUsd)} net`}
            foot={
              <Link href={home.pendingStatement.href} className="btn btn-accent btn-sm">
                Review →
              </Link>
            }
          />
        ) : (
          <HeroTile
            variant="flat"
            label="Statements"
            value="All clear"
            sub="Nothing awaiting your review"
            foot={
              <Link href="/owner/statements" className="text-terra no-underline">
                All statements →
              </Link>
            }
          />
        )}
        <HeroTile
          variant="flat"
          label="Next statement"
          value={home.nextStatementLabel}
          sub="Auto-prepares early next month"
          foot="Cadence · monthly"
        />
      </div>

      {/* Your villa(s) */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title={home.villas.length === 1 ? "Your villa" : "Your villas"}
          href="/owner/villas"
          link={`All villas (${home.villas.length}) →`}
        />
        {home.villas.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">
            No villa ownership recorded. Contact your operator to confirm shares.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {home.villas.map((v) => (
              <VillaCard
                key={v.id}
                href={v.href}
                code={v.code}
                name={v.name}
                imageUrl={v.imageUrl}
                bedrooms={v.bedrooms}
                occupancyPct={v.occupancyPct}
                netUsd={v.netUsd}
                location={v.location}
                orientation="row"
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming · next 14 days */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Upcoming · next 14 days"
          href="/owner/calendar"
          link="Full calendar →"
        />
        <UpcomingList
          items={home.upcoming.map((u) => ({ ...u, dateLabel: fmtDay(u.dateLabel) }))}
          emptyMessage="No arrivals or stays in the next 14 days."
        />
      </section>

      {/* Quick actions */}
      <section className="flex flex-col gap-4">
        <h2 className="owner-sec-title">Quick actions</h2>
        <OwnerQuickActions villas={villaOptions} />
      </section>
    </div>
  );
}
