import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DetailPage, DetailMainAndSide } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { DetailSide, type SideCard } from "@/components/dashboard/detail/detail-side";
import { DetailRelated, type RelatedItem } from "@/components/dashboard/detail/detail-related";
import { BookingDetailTabs } from "./_detail-client";
import { BookingNotesEditor } from "./_notes-editor";
import {
  getBookingDetail,
  listBookingAuditTimeline,
  type BookingDetail,
  type BookingAuditRow,
} from "@/features/bookings/booking-detail-queries";
import { listDocuments, type DocumentRow } from "@/features/documents/services";
import {
  listBookingAutomationRuns,
  type AutomationRunRow,
} from "@/features/booking-automation/services";
import type { WithSource } from "@/features/types";

export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

/* ----------------------------- formatters ----------------------------- */

function dateShort(iso: string): string {
  return new Date(iso + "T00:00:00Z")
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
    .toUpperCase();
}
function dateLong(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
function sizeLabel(bytes: number | null): string | null {
  if (!bytes) return null;
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function makeMoney(currency: string) {
  const full = (n: number) =>
    `${currency} ${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
  const compact = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return `${currency} ${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${currency} ${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${currency} ${(a / 1e3).toFixed(0)}K`;
    return `${currency} ${Math.round(a)}`;
  };
  return { full, compact };
}

/* ------------------------------- pieces ------------------------------- */

function channelPillClass(channelKey: string | null): string {
  const k = (channelKey ?? "").toLowerCase();
  if (k.includes("airbnb")) return "airbnb";
  if (k.includes("booking")) return "bcom";
  if (k.includes("agoda")) return "agoda";
  if (k.includes("travel") || k === "ta") return "ta";
  return "direct";
}

function ChargeRow({
  type,
  desc,
  date,
  display,
  note,
  muted,
}: {
  type: string;
  desc: string;
  date: string;
  display: string;
  note?: string;
  muted?: boolean;
}) {
  return (
    <tr>
      <td className="px-5 py-3 w-[92px] align-middle">
        <span className="inline-flex items-center rounded-md border border-line-soft bg-muted/40 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ink-secondary uppercase">
          {type}
        </span>
      </td>
      <td className="px-2 py-3 text-ink-secondary">{desc}</td>
      <td className="px-2 py-3 font-mono text-[12px] text-ink-tertiary tabular-nums whitespace-nowrap">
        {date}
      </td>
      <td
        className={`px-5 py-3 text-right font-mono tabular-nums whitespace-nowrap ${muted ? "text-ink-tertiary" : "text-ink"}`}
      >
        {display}
        {note && (
          <span className="ml-3 font-sans text-[11px] uppercase tracking-wide text-ink-tertiary">
            {note}
          </span>
        )}
      </td>
    </tr>
  );
}

function chargesPanel(b: BookingDetail) {
  const m = makeMoney(b.currency);
  type Line = {
    type: string;
    desc: string;
    amount: number;
    sign: "+" | "−";
    muted?: boolean;
    note?: string;
  };
  const lines: Line[] = [
    {
      type: "NIGHTLY",
      desc: `${b.nights} night${b.nights === 1 ? "" : "s"} × ${m.compact(b.grossAmount / Math.max(1, b.nights))}`,
      amount: b.grossAmount,
      sign: "+",
      note: "BASE",
    },
  ];
  if (b.cleaningFeeAmount > 0)
    lines.push({
      type: "SERVICE",
      desc: "Turnover cleaning",
      amount: b.cleaningFeeAmount,
      sign: "+",
    });
  if (b.channelFeeAmount > 0)
    lines.push({
      type: "FEE",
      desc: `${b.channelName ?? "Channel"} commission`,
      amount: b.channelFeeAmount,
      sign: "−",
      muted: true,
    });
  if (b.paymentFeeAmount > 0)
    lines.push({
      type: "FEE",
      desc: "Payment processing",
      amount: b.paymentFeeAmount,
      sign: "−",
      muted: true,
    });
  const net =
    b.netExpectedAmount ??
    b.grossAmount + b.cleaningFeeAmount - b.channelFeeAmount - b.paymentFeeAmount;

  const dateStr = dateLong(b.createdAt.slice(0, 10));

  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
        <span className="text-label">
          Charges <span className="text-ink-tertiary">· {lines.length} lines</span>
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line-soft text-label">
            <th className="px-5 py-2 text-left font-normal">Type</th>
            <th className="px-2 py-2 text-left font-normal">Description</th>
            <th className="px-2 py-2 text-left font-normal">Date</th>
            <th className="px-5 py-2 text-right font-normal">Amount ({b.currency})</th>
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr]:border-line-soft">
          {lines.map((l, i) => (
            <ChargeRow
              key={i}
              type={l.type}
              desc={l.desc}
              date={dateStr}
              display={`${l.sign}${m.full(l.amount)}`}
              note={l.note}
              muted={l.muted}
            />
          ))}
        </tbody>
      </table>
      <div className="px-5 py-3.5 border-t border-line-soft flex items-center justify-between bg-muted/20">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
          Net to operator after fees
        </span>
        <span className="font-mono tabular-nums text-terra font-semibold">
          {m.full(net)}
        </span>
      </div>
    </div>
  );
}

function settlementPanel(b: BookingDetail) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
        <span className="text-label">Settlement</span>
        {b.statement && (
          <Badge tone={b.statement.status === "draft" ? "neutral" : "success"}>
            {b.statement.status}
          </Badge>
        )}
      </div>
      <div className="px-5 py-4 text-sm">
        {b.statement ? (
          <div className="flex flex-col gap-2">
            <Row k="Settles into">
              <span className="font-mono text-terra">{b.statement.code}</span>
              <span className="text-ink-tertiary"> · owner statement</span>
            </Row>
            <p className="text-[12px] text-ink-tertiary mt-1">
              Charges post to this statement at checkout; the operator share above
              is what flows through after channel + processing fees.
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-secondary leading-relaxed">
            No owner statement linked yet — revenue posts to the owner statement on
            the checkout date. Card / Stripe settlement isn&rsquo;t recorded for
            channel bookings.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary w-[120px] shrink-0">
        {k}
      </span>
      <span className="text-sm text-ink min-w-0">{children}</span>
    </div>
  );
}

/* ------------------------------ activity ------------------------------ */

function auditDot(action: string): string {
  if (action.endsWith(".create")) return "var(--ok)";
  if (action.endsWith(".cancel") || action.endsWith(".delete")) return "var(--danger)";
  if (action.endsWith(".update")) return "var(--terra)";
  return "var(--ink-3)";
}
function auditTitle(a: BookingAuditRow): string {
  const meta = a.metadata as { field?: string } | null;
  if (a.action === "booking.update" && meta?.field === "notes") return "Notes edited";
  const map: Record<string, string> = {
    "booking.create": "Booking created",
    "booking.update": "Booking updated",
    "booking.cancel": "Booking cancelled",
  };
  return map[a.action] ?? a.action.replace(/\./g, " · ").replace(/_/g, " ");
}
function auditDetail(a: BookingAuditRow): string | null {
  const after = a.after as Record<string, unknown> | null;
  const meta = a.metadata as { field?: string } | null;
  if (meta?.field === "notes" && after && typeof after.notes === "string") {
    return after.notes ? `“${after.notes}”` : "Notes cleared";
  }
  return null;
}

type TimelineItem = {
  id: string;
  title: string;
  detail: string | null;
  when: string;
  source: string;
  dot: string;
};

function buildTimeline(
  audit: BookingAuditRow[],
  runs: WithSource<AutomationRunRow>[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...audit.map((a) => ({
      id: `a-${a.id}`,
      title: auditTitle(a),
      detail: auditDetail(a),
      when: a.createdAt,
      source: a.actorName ? `by ${a.actorName}` : "SYSTEM",
      dot: auditDot(a.action),
    })),
    ...runs.map((r) => ({
      id: `r-${r.id}`,
      title: `${r.ruleName ?? "Automation"} · ${r.runStatus}`,
      detail: r.reason,
      when: r.createdAt,
      source: "AUTOMATED",
      dot: "var(--info, #3b6ea5)",
    })),
  ];
  return items.sort((x, y) => (x.when < y.when ? 1 : -1));
}

/* ------------------------------ documents ----------------------------- */

function docKind(d: DocumentRow): { ext: string; tone: string } {
  const name = (d.fileName ?? "").toLowerCase();
  const mime = (d.mimeType ?? "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf"))
    return { ext: "PDF", tone: "text-terra" };
  if (mime.includes("png") || name.endsWith(".png"))
    return { ext: "PNG", tone: "text-info" };
  if (mime.includes("jpe") || name.match(/\.jpe?g$/))
    return { ext: "JPG", tone: "text-info" };
  return { ext: "FILE", tone: "text-ink-tertiary" };
}
function docBadge(d: WithSource<DocumentRow>): { label: string; tone: "success" | "neutral" | "info" } {
  if (d.signedAt) return { label: "SIGNED", tone: "success" };
  if (d.documentType === "kyc") return { label: "VERIFIED", tone: "success" };
  if (["invoice", "receipt", "statement"].includes(d.documentType))
    return { label: "AUTO", tone: "neutral" };
  return { label: d.documentType.toUpperCase(), tone: "neutral" };
}

/* -------------------------------- page -------------------------------- */

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await getBookingDetail(id);
  if (!b) notFound();

  const [audit, docsRaw, runs] = await Promise.all([
    listBookingAuditTimeline(id),
    listDocuments({ entityType: "booking", entityId: id }),
    listBookingAutomationRuns({ bookingId: id }).catch(() => [] as WithSource<AutomationRunRow>[]),
  ]);
  const docs = docsRaw.filter((d) => d.status !== "archived");

  const m = makeMoney(b.currency);
  const pax = (b.adults ?? 0) + (b.children ?? 0);
  const hasPax = b.adults !== null || b.children !== null;
  const selfOwner =
    !!b.owner?.email && !!b.guestEmail
      ? b.owner.email.toLowerCase() === b.guestEmail.toLowerCase()
      : false;

  const channelPill = (
    <span className={`channel-pill ${channelPillClass(b.channelKey)}`}>
      <span className="dot" />
      {(b.channelName ?? "Direct").toUpperCase()}
      {b.sourceReference ? ` · ${b.sourceReference}` : ""}
    </span>
  );

  const timeline = buildTimeline(audit, runs);
  const latestRun = runs[0];

  /* -------- side rail -------- */
  const sideCards: SideCard[] = [
    {
      id: "guest",
      eyebrow: "Primary guest",
      title: b.guestName ?? "Guest",
      body: (
        <div className="flex flex-col gap-0.5">
          <span className="text-ink">{b.guestPhone ?? "—"}</span>
          <span className="text-ink truncate">{b.guestEmail ?? "—"}</span>
        </div>
      ),
      footer: (
        <div className="flex gap-2">
          {b.guestEmail ? (
            <a className="btn btn-secondary btn-sm flex-1" href={`mailto:${b.guestEmail}`}>
              Email
            </a>
          ) : (
            <button className="btn btn-secondary btn-sm flex-1 opacity-50 cursor-not-allowed" disabled>
              Email
            </button>
          )}
          {b.guestPhone ? (
            <a
              className="btn btn-secondary btn-sm flex-1"
              href={`sms:${b.guestPhone.replace(/[^\d+]/g, "")}`}
            >
              SMS
            </a>
          ) : (
            <button className="btn btn-secondary btn-sm flex-1 opacity-50 cursor-not-allowed" disabled>
              SMS
            </button>
          )}
        </div>
      ),
    },
    {
      id: "channel",
      eyebrow: "Channel sync",
      title: b.channelName ?? "Direct",
      body: (
        <span className="text-ink-secondary">
          {b.lastSyncedAt
            ? `Synced ${ago(b.lastSyncedAt)}`
            : b.channelName
              ? "No calendar sync recorded"
              : "Direct booking — no channel"}
        </span>
      ),
    },
    {
      id: "owner",
      eyebrow: "Owner",
      title: b.owner?.name ?? "—",
      body: (
        <span className="text-ink-secondary">
          {b.owner
            ? `${selfOwner ? "Self-owner" : b.owner.model} · joined ${b.owner.startsOn ? dateLong(b.owner.startsOn).slice(3) : "—"}`
            : "No active owner on record"}
        </span>
      ),
    },
  ];

  /* -------- related -------- */
  const related: RelatedItem[] = [
    {
      id: "guest-r",
      href: "/dashboard/guests",
      title: <>{b.guestName ?? "Guest"}</>,
      meta: selfOwner && b.villaCode ? `OWNER OF ${b.villaCode}` : "PRIMARY GUEST",
    },
    {
      id: "villa-r",
      href: `/dashboard/villas/${b.villaId}`,
      title: <>{b.villaName ?? b.villaCode ?? "Villa"}</>,
      meta: `OPEN ${b.villaCode ?? "VILLA"}`,
    },
  ];
  if (b.statement)
    related.push({
      id: "stmt-r",
      href: "/dashboard/finance",
      title: <>{b.statement.code}</>,
      meta: `OWNER STATEMENT · ${b.statement.status.toUpperCase()}`,
    });

  /* -------- panels -------- */
  const overviewPanel = (
    <div className="flex flex-col gap-6 px-7 py-6">
      <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
        <div className="px-5 py-3.5 border-b border-line-soft">
          <span className="text-label">Stay details</span>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <Row k="Check-in">{dateLong(b.checkIn)}</Row>
          <Row k="Check-out">{dateLong(b.checkOut)}</Row>
          <Row k="Notes">
            <BookingNotesEditor bookingId={b.id} initial={b.notes ?? ""} />
          </Row>
          <Row k="Channel ref">
            {b.sourceReference ? (
              <span className="font-mono">{b.sourceReference}</span>
            ) : (
              "—"
            )}
            {b.channelName ? ` · ${b.channelName}` : ""}
          </Row>
          <Row k="Arrival prep">
            {latestRun ? (
              <span className="inline-flex items-center gap-2">
                <Badge tone={latestRun.runStatus === "created" ? "success" : "neutral"}>
                  {latestRun.runStatus}
                </Badge>
                <span className="text-ink-secondary">{latestRun.reason ?? "—"}</span>
              </span>
            ) : (
              <span className="text-ink-tertiary">No automation runs yet</span>
            )}
          </Row>
        </div>
      </div>

      {chargesPanel(b)}

      <DetailRelated eyebrow="Also see" items={related} />
    </div>
  );

  const chargesTabPanel = (
    <div className="flex flex-col gap-6 px-7 py-6">
      {chargesPanel(b)}
      {settlementPanel(b)}
    </div>
  );

  const guestsPanel = (
    <div className="flex flex-col gap-5 px-7 py-6">
      <div className="flex items-center justify-between">
        <span className="text-label">
          Guests <span className="text-ink-tertiary">· {b.guestName ? 1 : 0} named · party of {pax}</span>
        </span>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          title="Adding guests lands in a later pass"
        >
          + Add guest
        </button>
      </div>

      {b.guestName ? (
        <div className="rounded-lg border border-line-soft bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-gradient-coral-soft border border-line-soft inline-flex items-center justify-center font-mono text-[12px] text-ink">
              {initials(b.guestName)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-display text-[17px] text-ink">{b.guestName}</span>
                <Badge tone="neutral">PRIMARY</Badge>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary mt-0.5">
                Adult · Lead booker
                {selfOwner && b.villaCode ? ` · Owner of ${b.villaCode}` : ""}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Row k="Email">{b.guestEmail ?? "—"}</Row>
            <Row k="Phone">{b.guestPhone ?? "—"}</Row>
            <Row k="Nationality">{b.guestNationality ?? "—"}</Row>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
          No named guest on this booking.
        </div>
      )}

      <div className="rounded-md border border-line-soft bg-muted/30 p-5 text-[13px] text-ink-secondary leading-relaxed">
        Party of {pax}
        {hasPax ? ` · ${b.adults ?? 0} adult${b.adults === 1 ? "" : "s"} + ${b.children ?? 0} child${b.children === 1 ? "" : "ren"}` : ""}.
        Accompanying guests, per-guest IDs, and dietary / mobility requirements
        aren&rsquo;t itemised for this booking yet.
      </div>
    </div>
  );

  const activityPanel = (
    <div className="flex flex-col gap-4 px-7 py-6">
      <div className="flex items-center justify-between">
        <span className="text-label">
          Activity <span className="text-ink-tertiary">· {timeline.length} events</span>
        </span>
        <select
          className="select select-sm"
          title="Source filtering lands in a later pass"
          defaultValue="all"
        >
          <option value="all">All sources</option>
        </select>
      </div>

      {timeline.length === 0 ? (
        <p className="text-sm text-ink-tertiary italic">No activity recorded yet.</p>
      ) : (
        <ol className="flex flex-col">
          {timeline.map((t) => (
            <li
              key={t.id}
              className="grid grid-cols-[16px_1fr] gap-3 py-3 border-b border-line-soft last:border-0"
            >
              <span
                className="w-2 h-2 rounded-full mt-1.5"
                style={{ background: t.dot }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="text-sm text-ink">{t.title}</div>
                {t.detail && (
                  <div className="text-[12px] text-ink-secondary mt-0.5">{t.detail}</div>
                )}
                <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-tertiary mt-1">
                  {dateTimeLabel(t.when)} · {t.source}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const documentsPanel = (
    <div className="flex flex-col gap-4 px-7 py-6">
      <div className="flex items-center justify-between">
        <span className="text-label">
          Documents <span className="text-ink-tertiary">· {docs.length} files</span>
        </span>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          title="Upload lands in a later pass"
        >
          Upload
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-ink-tertiary italic">No documents on this booking yet.</p>
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          {docs.map((d) => {
            const kind = docKind(d);
            const badge = docBadge(d);
            const size = sizeLabel(d.sizeBytes);
            const verb = d.signedAt ? "SIGNED" : "ADDED";
            const when = dateShort((d.signedAt ?? d.createdAt).slice(0, 10));
            return (
              <div
                key={d.id}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-line-soft last:border-0"
              >
                <span
                  className={`shrink-0 w-9 h-9 rounded-md border border-line-soft bg-muted/40 inline-flex items-center justify-center font-mono text-[10px] font-medium ${kind.tone}`}
                >
                  {kind.ext}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate">{d.title}</div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-tertiary mt-0.5">
                    {verb} {when}
                    {size ? ` · ${size}` : ""}
                  </div>
                </div>
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  title="File storage not wired yet"
                >
                  View
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-center">
        <p className="text-sm text-ink-secondary">Drop files to upload</p>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-tertiary mt-1">
          PDF · JPG · PNG up to 10 MB · upload lands in a later pass
        </p>
      </div>
    </div>
  );

  return (
    <DetailPage>
      <DetailHeader
        breadcrumb={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: b.bookingCode },
        ]}
        title={
          <>
            {b.guestName || "Guest"}{" "}
            <span style={{ fontSize: 18, color: "var(--ink-3)" }}>
              · {b.villaName ?? b.villaCode ?? "—"}
            </span>
          </>
        }
        meta={
          <>
            <Badge
              tone={b.status === "cancelled" || b.status === "no_show" ? "neutral" : "success"}
            >
              {b.status.replace(/_/g, " ")}
            </Badge>
            <span>
              {dateShort(b.checkIn)} → {dateShort(b.checkOut)} · {b.nights}N
            </span>
            <span>·</span>
            {channelPill}
            {hasPax && <span>· {pax} PAX</span>}
            {hasPax && (
              <span>
                · {b.adults ?? 0} adults + {b.children ?? 0} children
              </span>
            )}
            <span>· {m.compact(b.grossAmount)} gross</span>
          </>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              title="Folio export lands in a later pass"
            >
              Print folio
            </button>
            {b.guestEmail ? (
              <a className="btn btn-secondary btn-sm" href={`mailto:${b.guestEmail}`}>
                Message guest
              </a>
            ) : (
              <button
                className="btn btn-secondary btn-sm opacity-50 cursor-not-allowed"
                disabled
                title="No guest email on file"
              >
                Message guest
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              title="Extend stay lands in a later pass"
            >
              Extend stay
            </button>
            <button
              className="btn btn-accent btn-sm"
              type="button"
              title="Charge lines aren't tracked yet"
            >
              + Add charge
            </button>
          </div>
        }
      />

      <DetailMainAndSide>
        <BookingDetailTabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "charges", label: "Charges", count: chargeLineCount(b) },
            { id: "guests", label: "Guests", count: b.guestName ? 1 : 0 },
            { id: "activity", label: "Activity", count: timeline.length },
            { id: "docs", label: "Documents", count: docs.length },
          ]}
          panels={{
            overview: overviewPanel,
            charges: chargesTabPanel,
            guests: guestsPanel,
            activity: activityPanel,
            docs: documentsPanel,
          }}
        />
        <DetailSide cards={sideCards} />
      </DetailMainAndSide>
    </DetailPage>
  );
}

function chargeLineCount(b: BookingDetail): number {
  let n = 1; // nightly base
  if (b.cleaningFeeAmount > 0) n++;
  if (b.channelFeeAmount > 0) n++;
  if (b.paymentFeeAmount > 0) n++;
  return n;
}
