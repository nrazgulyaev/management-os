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
 */

import "server-only";

import Link from "next/link";
import { ArrowUpRight, Banknote, Plug, TrendingUp } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

const TIER_TONE: Record<TrustTier, "success" | "warning" | "danger" | "neutral"> = {
  live: "success",
  dry_run: "warning",
  error: "danger",
  paused: "warning",
  ignored: "neutral",
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
      <Badge tone={TIER_TONE[tier]}>{TIER_LABEL[tier]}</Badge>
      <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
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
      <Section
        eyebrow="Connected"
        title="Live connections"
        description="Per-org integrations with real connect / test / disconnect controls."
      >
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to manage live integration connections."
        />
      </Section>
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
    <Section
      eyebrow="Connected"
      title="Live connections"
      description={`${total} per-org connection${total === 1 ? "" : "s"} · ${live} live · ${dryRun} dry-run. Trust tier is read straight from each connection's status — a stub provider shows "Dry-run", never a false green.`}
    >
      {total === 0 ? (
        <EmptyState
          title="No live connections yet"
          description="Connect a channel manager, bank account, or marketing platform to manage it here. Use the catalog below to start."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {channels.length > 0 && (
            <FamilyTable
              icon={<Plug className="w-4 h-4" strokeWidth={1.75} />}
              title="Channel managers"
              addHref="/development-os/channels"
              addLabel="Manage channels"
            >
              {channels.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/development-os/channels/${c.id}`}
                      className="hover:underline"
                    >
                      <Badge tone="outline">{c.channel}</Badge>
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    {c.villaName ?? c.villaCode ?? c.externalPropertyId}
                  </TD>
                  <TD>
                    <TrustTierBadge status={c.status} />
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {fmtWhen(c.lastReservationSyncAt ?? c.lastInventorySyncAt)}
                  </TD>
                  <TD>
                    <ChannelConnectionActions
                      connectionId={c.id}
                      status={c.status as ChannelConnectionStatus}
                    />
                  </TD>
                </TR>
              ))}
            </FamilyTable>
          )}

          {banks.length > 0 && (
            <FamilyTable
              icon={<Banknote className="w-4 h-4" strokeWidth={1.75} />}
              title="Banking sync"
              addHref="/development-os/banking/new"
              addLabel="Add bank connection"
            >
              {banks.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <Link
                      href={`/development-os/banking/${b.id}`}
                      className="hover:underline"
                    >
                      <Badge tone="outline">{b.provider}</Badge>
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    {b.accountName ?? b.externalAccountId}
                    <span className="text-ink-tertiary font-mono ml-1">
                      {b.currency}
                    </span>
                  </TD>
                  <TD>
                    <TrustTierBadge status={b.status} />
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {fmtWhen(b.lastSyncedAt)}
                  </TD>
                  <TD>
                    <BankConnectionActions
                      connectionId={b.id}
                      status={b.status}
                      provider={b.provider}
                    />
                  </TD>
                </TR>
              ))}
            </FamilyTable>
          )}

          {marketing.length > 0 && (
            <FamilyTable
              icon={<TrendingUp className="w-4 h-4" strokeWidth={1.75} />}
              title="Marketing connections"
              addHref="/development-os/marketing/connections/new"
              addLabel="Connect provider"
            >
              {marketing.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <Link
                      href={`/development-os/marketing/connections/${m.id}`}
                      className="hover:underline"
                    >
                      <Badge tone="outline">{m.provider}</Badge>
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    {m.accountName ?? m.externalAccountId}
                  </TD>
                  <TD>
                    <TrustTierBadge status={m.status} />
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {fmtWhen(m.lastSyncedAt)}
                  </TD>
                  <TD>
                    <MarketingConnectionActions
                      connectionId={m.id}
                      status={m.status}
                    />
                  </TD>
                </TR>
              ))}
            </FamilyTable>
          )}
        </div>
      )}
    </Section>
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
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="text-ink-tertiary">{icon}</span>
          {title}
        </h3>
        <Button asChild variant="secondary" size="sm">
          <Link href={addHref}>
            {addLabel}
            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
        </Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Provider</TH>
            <TH>Account</TH>
            <TH>Trust tier</TH>
            <TH>Last sync</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>{children}</TBody>
      </Table>
    </div>
  );
}
