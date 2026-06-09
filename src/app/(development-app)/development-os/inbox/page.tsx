import type { Metadata } from "next";
import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { listThreads } from "@/lib/messaging/queries";
import {
  MESSAGING_CHANNELS,
  THREAD_STATUSES,
  type MessagingChannel,
  type ThreadStatus,
} from "@/lib/db/schema/messaging";

/**
 * Dev OS /inbox — pixel redesign to cabinets/dev-p3/Dev Ops.html (Unified
 * inbox screen): SectionHeading hero · 4-KPI strip · a chip filter bar ·
 * a "Threads" card whose rows are the mock's channel-chip / subject-meta
 * / unread-badge layout.
 *
 * Data wiring is preserved: the same listThreads({channel,status,
 * unreadOnly,search}) fetch drives the list, and every filter remains
 * reachable — channel + unread are now quick chips (query-param links),
 * status + subject search stay as a compact GET form, so no filtering
 * capability is lost. The getDb() guard stays.
 */

export const metadata: Metadata = { title: "Inbox · Development OS" };
export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<MessagingChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook_messenger: "Messenger",
  email: "Email",
  sms: "SMS",
  internal_note: "Internal note",
};

/** 2-letter chips for the thread-row channel marker (mock `.gs-thread .ch`). */
const CHANNEL_SHORT: Record<string, string> = {
  whatsapp: "WA",
  telegram: "TG",
  instagram: "IG",
  facebook_messenger: "FB",
  email: "EM",
  sms: "SMS",
  internal_note: "IN",
};

/** Channel quick-filter chips shown in the filter bar (mock order). */
const CHANNEL_CHIPS: MessagingChannel[] = [
  "whatsapp",
  "instagram",
  "email",
];

function buildHref(params: {
  channel?: string;
  status?: string;
  unread?: string;
  q?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.channel) sp.set("channel", params.channel);
  if (params.status) sp.set("status", params.status);
  if (params.unread) sp.set("unread", params.unread);
  if (params.q) sp.set("q", params.q);
  const qs = sp.toString();
  return qs ? `/development-os/inbox?${qs}` : "/development-os/inbox";
}

export default async function MessagingInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    channel?: string;
    status?: string;
    unread?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const channel = (MESSAGING_CHANNELS as readonly string[]).includes(
    sp.channel ?? "",
  )
    ? (sp.channel as MessagingChannel)
    : undefined;
  const status = (THREAD_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ThreadStatus)
    : undefined;
  const unreadOnly = sp.unread === "1";
  const search = (sp.q ?? "").trim() || undefined;

  const db = getDb();
  if (!db) {
    return (
      <>
        <SectionHeading
          eyebrow="growth · omnichannel messaging"
          title="Unified inbox"
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </>
    );
  }

  const threads = await listThreads({
    channel,
    status,
    unreadOnly,
    search,
    limit: 200,
  });
  const unreadTotal = threads.reduce((acc, t) => acc + t.unreadCount, 0);
  const unreadThreadCount = threads.filter((t) => t.unreadCount > 0).length;
  const activeCount = threads.filter((t) => t.status === "active").length;
  const channelsRepresented = new Set(
    threads.map((t) => t.primaryChannel).filter(Boolean),
  ).size;

  // Preserve the rest of the active query so chip links don't reset
  // unrelated filters (e.g. an open search term).
  const base = { status: sp.status, q: sp.q };

  return (
    <>
      <SectionHeading
        eyebrow="growth · omnichannel messaging"
        title={
          <>
            Every conversation, <span className="text-amber italic">one view</span>.
          </>
        }
        subtitle="WhatsApp, Telegram, Instagram, Messenger, Email and SMS in a single thread list. Templates and auto-response rules from the side actions."
        actions={
          <>
            <Link
              href="/development-os/inbox/templates"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Templates
            </Link>
            <Link
              href="/development-os/inbox/auto-responses"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Auto-responses
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-4">
        <Kpi
          label="Open threads"
          value={String(activeCount)}
          sub={`across ${channelsRepresented} channel${channelsRepresented === 1 ? "" : "s"}`}
          tone="accent"
        />
        <Kpi
          label="Unread"
          value={String(unreadThreadCount)}
          sub={unreadTotal > 0 ? `${unreadTotal} messages` : "need reply"}
          tone={unreadThreadCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Threads loaded"
          value={String(threads.length)}
          sub="most recent first"
        />
        <Kpi
          label="Status filter"
          value={status ? status : "all"}
          sub={unreadOnly ? "unread only" : "all threads"}
        />
      </div>

      {/* Chip filter bar — channel + unread are quick links; the form
          below keeps status + subject search reachable. */}
      <div className="filter-bar rounded-[10px] border border-line-soft mb-3.5">
        <Link
          href={buildHref({ ...base })}
          prefetch={false}
          className={
            "chip" +
            (!channel
              ? " bg-carbon text-[var(--inverted-fg)] border-[var(--carbon)]"
              : "")
          }
        >
          All channels
        </Link>
        {CHANNEL_CHIPS.map((c) => (
          <Link
            key={c}
            href={buildHref({ ...base, channel: c, unread: sp.unread })}
            prefetch={false}
            className={
              "chip" +
              (channel === c
                ? " bg-carbon text-[var(--inverted-fg)] border-[var(--carbon)]"
                : "")
            }
          >
            {CHANNEL_LABELS[c]}
          </Link>
        ))}
        <span className="w-px h-5 bg-line-soft mx-0.5" aria-hidden />
        <Link
          href={buildHref({
            ...base,
            channel: sp.channel,
            unread: unreadOnly ? undefined : "1",
          })}
          prefetch={false}
          className={
            "chip" +
            (unreadOnly
              ? " bg-carbon text-[var(--inverted-fg)] border-[var(--carbon)]"
              : "")
          }
        >
          Unread only
        </Link>

        <form
          method="GET"
          action="/development-os/inbox"
          className="ml-auto flex items-center gap-2"
          data-testid="messaging-inbox-filter-form"
        >
          {channel && <input type="hidden" name="channel" value={channel} />}
          {unreadOnly && <input type="hidden" name="unread" value="1" />}
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            aria-label="Status"
            className="rounded-full border border-line bg-surface px-3 py-[6px] text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="">All statuses</option>
            {THREAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Subject contains…"
            aria-label="Search subject"
            className="rounded-full border border-line bg-surface px-3.5 py-[6px] text-[12.5px] text-ink w-[180px] focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button type="submit" className="btn btn-dark btn-sm">
            Apply
          </button>
        </form>
      </div>

      <div className="card card-pad">
        <div className="flex items-center gap-2.5 mb-3.5">
          <h3 className="font-display text-[19px] font-medium leading-none tracking-[-0.02em] text-ink m-0">
            Threads
          </h3>
          <span className="ml-auto font-mono text-[10.5px] tracking-[0.04em] text-ink-tertiary uppercase">
            {threads.length} · {unreadTotal} unread
          </span>
        </div>

        {threads.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            description="Once a webhook delivers an inbound message, threads will appear here. Clear filters to widen the view."
          />
        ) : (
          <div>
            {threads.map((t, i) => {
              const short = t.primaryChannel
                ? (CHANNEL_SHORT[t.primaryChannel] ?? "··")
                : "··";
              return (
                <Link
                  key={t.id}
                  href={`/development-os/inbox/${t.id}`}
                  className={
                    "grid grid-cols-[26px_1fr_auto] items-center gap-[11px] py-[11px] border-line-soft" +
                    (i < threads.length - 1 ? " border-b" : "")
                  }
                >
                  <span className="w-[26px] h-[26px] rounded-[7px] bg-inset inline-flex items-center justify-center font-mono text-[10px] text-ink-secondary">
                    {short}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-ink truncate">
                      {t.subject ?? "(no subject)"}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-tertiary mt-0.5">
                      {t.primaryChannel
                        ? CHANNEL_LABELS[t.primaryChannel as MessagingChannel] ??
                          t.primaryChannel
                        : "—"}{" "}
                      · {t.status} · {t.totalMessages} msg
                      {t.lastMessageAt
                        ? ` · ${new Date(t.lastMessageAt)
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")}`
                        : ""}
                    </span>
                  </span>
                  {t.unreadCount > 0 ? (
                    <HandoffBadge tone="warn">
                      {t.unreadCount} unread
                    </HandoffBadge>
                  ) : (
                    <HandoffBadge tone="soft">read</HandoffBadge>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
