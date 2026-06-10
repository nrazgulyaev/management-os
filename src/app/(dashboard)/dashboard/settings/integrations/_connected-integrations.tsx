/**
 * settings-honest-connect (P1) — Honest connect hub.
 *
 * The integrations page used to be a read-only status grid driven only
 * by env-var presence. This server section makes it HONEST for the three
 * per-org, DB-backed integration families that already have real
 * connect/disconnect/test wiring over in /development-os:
 *
 *   - Channel managers   (Booking.com / Airbnb / Agoda / Expedia / …)
 *   - Banking sync       (Revolut / Wise / Mandiri / BCA / manual)
 *   - Marketing          (GA4 / Google Ads / Meta / TikTok / Mailchimp / …)
 *
 * For each live connection it renders the REAL trust-tier badge sourced
 * from the connection's own status FSM (active = live, dry_run = stubbed,
 * error = needs attention, paused / archived = ignored) plus inline
 * Test-connection / Sync / Disconnect buttons by reusing the EXISTING
 * client action components — no false-green, no new backend.
 *
 * pixel-mgmt-integrations-deep — re-skinned from the LEGACY ui `<Table>` /
 * `<Section>` / `<Badge tone>` surface tokens to the management-lineage
 * chrome from cabinets/mgmt-p3/Integrations.html: `<SectionHeading>`,
 * `<Card overflowHidden>` + `table.data` (mono th, `td.mono`/`.num`),
 * chrome `.badge` trust pills and `.btn` actions. Every fetch + action +
 * prop is preserved.
 */

import "server-only";

import Link from "next/link";
import { ArrowUpRight, Banknote, Plug, TrendingUp } from "lucide-react";
import { Card, SectionHeading } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import { listBankConnectionsForUi } from "@/lib/banking/queries";
import { listConnectionsForUi as listMarketingConnectionsForUi } from "@/lib/marketing/queries";
import { listChannelConnections } from "@/lib/channel-manager/queries";
import type { ChannelConnectionStatus } from "@/lib/db/schema/channel-manager";
import { BankConnectionActions } from "@/components/banking/connection-actions-buttons";
import { MarketingConnectionActions } from "@/components/marketing/connection-actions-buttons";
import { ConnectionActions as ChannelConnectionActions } from "@/components/development/channels/connection-actions";

/**
 * Trust-tier semantics, derived from the connection's own status FSM so
 * the badge can NEVER be falsely green:
 *   - active  → "Live"     (real upstream feed verified)
 *   - dry_run → "Dry-run"  (stub provider; no real API wired)
 *   - error   → "Error"    (last test/sync failed)
 *   - paused / connecting / pending → "Paused"
 *   - archived / disconnected → "Ignored"
 */
type TrustTier = "live" | "dry_run" | "error" | "paused" | "ignored";

function trustTier(status: string): TrustTier {
  switch (status) {
    case "active":
      return "live";
    case "dry_run":
      return "dry_run";
    case "error":
      return "error";
    case "paused":
    case "connecting":
    case "pending":
      return "paused";
    case "archived":
    case "disconnected":
      return "ignored";
    default:
      return "paused";
  }
}

/** Trust tier → chrome `.badge-*` palette (matches the catalog cards). */
const TIER_BADGE: Record<TrustTier, string> = {
  live: "badge-ok",
  dry_run: "badge-warn",
  error: "badge-danger",
  paused: "badge-warn",
  ignored: "badge-soft",
};

const TIER_LABEL: Record<TrustTier, string> = {
  live: "Live",
  dry_run: "Dry-run",
  error: "Error",
  paused: "Paused",
  ignored: "Ignored",
};

function TrustTierBadge({ status }: { status: string }) {
  const tier = trustTier(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`badge ${TIER_BADGE[tier]}`}>{TIER_LABEL[tier]}</span>
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
        {status}
      </span>
    </span>
  );
}

function fmtWhen(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export async function ConnectedIntegrations() {
  const db = getDb();
  if (!db) {
    return (
      <section>
        <SectionHeading
          eyebrow="Connected"
          title={<>Live connections</>}
          subtitle="Per-org integrations with real connect / test / disconnect controls."
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to manage live integration connections."
        />
      </section>
    );
  }

  const [channels, banks, marketing] = await Promise.all([
    safeQuery(
      "settings-integrations.channels",
      listChannelConnections(),
      [] as Awaited<ReturnType<typeof listChannelConnections>>,
    ),
    safeQuery(
      "settings-integrations.banks",
      listBankConnectionsForUi(),
      [] as Awaited<ReturnType<typeof listBankConnectionsForUi>>,
    ),
    safeQuery(
      "settings-integrations.marketing",
      listMarketingConnectionsForUi(),
      [] as Awaited<ReturnType<typeof listMarketingConnectionsForUi>>,
    ),
  ]);

  const total = channels.length + banks.length + marketing.length;
  const live =
    channels.filter((c) => trustTier(c.status) === "live").length +
    banks.filter((b) => trustTier(b.status) === "live").length +
    marketing.filter((m) => trustTier(m.status) === "live").length;
  const dryRun =
    channels.filter((c) => trustTier(c.status) === "dry_run").length +
    banks.filter((b) => trustTier(b.status) === "dry_run").length +
    marketing.filter((m) => trustTier(m.status) === "dry_run").length;

  return (
    <section>
      <SectionHeading
        eyebrow="Connected"
        title={<>Live connections</>}
        subtitle={`${total} per-org connection${total === 1 ? "" : "s"} · ${live} live · ${dryRun} dry-run. Trust tier is read straight from each connection's status — a stub provider shows "Dry-run", never a false green.`}
      />

      {total === 0 ? (
        <EmptyState
          title="No live connections yet"
          description="Connect a channel manager, bank account, or marketing platform to manage it here. Use the catalog below to start."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {channels.length > 0 && (
            <FamilyTable
              icon={<Plug className="h-4 w-4" strokeWidth={1.75} />}
              title="Channel managers"
              addHref="/development-os/channels"
              addLabel="Manage channels"
            >
              {channels.map((c) => (
                <tr key={c.id}>
                  <td className="row-title">
                    <Link
                      href={`/development-os/channels/${c.id}`}
                      className="hover:text-terra"
                    >
                      {c.channel}
                    </Link>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {c.villaName ?? c.villaCode ?? c.externalPropertyId}
                  </td>
                  <td>
                    <TrustTierBadge status={c.status} />
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {fmtWhen(c.lastReservationSyncAt ?? c.lastInventorySyncAt)}
                  </td>
                  <td>
                    <ChannelConnectionActions
                      connectionId={c.id}
                      status={c.status as ChannelConnectionStatus}
                    />
                  </td>
                </tr>
              ))}
            </FamilyTable>
          )}

          {banks.length > 0 && (
            <FamilyTable
              icon={<Banknote className="h-4 w-4" strokeWidth={1.75} />}
              title="Banking sync"
              addHref="/development-os/banking/new"
              addLabel="Add bank connection"
            >
              {banks.map((b) => (
                <tr key={b.id}>
                  <td className="row-title">
                    <Link
                      href={`/development-os/banking/${b.id}`}
                      className="hover:text-terra"
                    >
                      {b.provider}
                    </Link>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {b.accountName ?? b.externalAccountId}
                    <span className="mono ml-1 text-ink-4">{b.currency}</span>
                  </td>
                  <td>
                    <TrustTierBadge status={b.status} />
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {fmtWhen(b.lastSyncedAt)}
                  </td>
                  <td>
                    <BankConnectionActions
                      connectionId={b.id}
                      status={b.status}
                      provider={b.provider}
                    />
                  </td>
                </tr>
              ))}
            </FamilyTable>
          )}

          {marketing.length > 0 && (
            <FamilyTable
              icon={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
              title="Marketing connections"
              addHref="/development-os/marketing/connections/new"
              addLabel="Connect provider"
            >
              {marketing.map((m) => (
                <tr key={m.id}>
                  <td className="row-title">
                    <Link
                      href={`/development-os/marketing/connections/${m.id}`}
                      className="hover:text-terra"
                    >
                      {m.provider}
                    </Link>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {m.accountName ?? m.externalAccountId}
                  </td>
                  <td>
                    <TrustTierBadge status={m.status} />
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {fmtWhen(m.lastSyncedAt)}
                  </td>
                  <td>
                    <MarketingConnectionActions
                      connectionId={m.id}
                      status={m.status}
                    />
                  </td>
                </tr>
              ))}
            </FamilyTable>
          )}
        </div>
      )}
    </section>
  );
}

function FamilyTable({
  icon,
  title,
  addHref,
  addLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  addHref: string;
  addLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <span className="text-ink-4">{icon}</span>
          {title}
        </h3>
        <Link href={addHref} className="btn btn-secondary btn-sm">
          {addLabel}
          <ArrowUpRight className="ml-1 h-3.5 w-3.5" strokeWidth={1.75} />
        </Link>
      </div>
      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Account</th>
              <th scope="col">Trust tier</th>
              <th scope="col">Last sync</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </Card>
    </div>
  );
}
