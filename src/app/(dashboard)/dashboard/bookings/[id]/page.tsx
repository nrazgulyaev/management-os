import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DetailPage, DetailMainAndSide } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { DetailSide, type SideCard } from "@/components/dashboard/detail/detail-side";
import { DetailRelated, type RelatedItem } from "@/components/dashboard/detail/detail-related";
import { BookingDetailTabs } from "./_detail-client";
import { BookingNotesEditor } from "./_notes-editor";
import { ExtendStayButton } from "./_extend-stay";
import { AddGuestButton } from "./_guest-add";
import { AddChargeButton } from "./_charge-add";
import { UploadDocButton, DocViewButton, PrintFolioButton } from "./_doc-controls";
import {
  getBookingDetail,
  listBookingAuditTimeline,
  listBookingParty,
  listBookingChargeLines,
  getBookingPayment,
  getBookingMeta,
  type BookingDetail,
  type BookingAuditRow,
  type BookingPartyGuest,
  type BookingChargeLine,
  type BookingPaymentRow,
  type BookingMetaRow,
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

function chargesPanel(b: BookingDetail, realLines: BookingChargeLine[]) {
  const m = makeMoney(b.currency);
  type Line = {
    type: string;
    desc: string;
    amount: number;
    sign: "+" | "−";
    muted?: boolean;
    note?: string;
    date?: string;
  };

  let lines: Line[];
  let net: number;

  if (realLines.length > 0) {
    // Real itemised ledger (booking_charges).
    lines = realLines.map((l) => ({
      type: l.chargeType.toUpperCase(),
      desc: l.description,
      amount: l.amount,
      sign: l.amount < 0 ? "−" : "+",
      muted: l.amount < 0,
      note: l.note ?? undefined,
      date: l.occurredOn ? dateLong(l.occurredOn) : undefined,
    }));
    net = realLines.reduce((s, l) => s + l.amount, 0);
  } else {
    // Derived from the flat fee columns when no ledger rows exist.
    lines = [
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
    net =
      b.netExpectedAmount ??
      b.grossAmount + b.cleaningFeeAmount - b.channelFeeAmount - b.paymentFeeAmount;
  }

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
              date={l.date ?? dateStr}
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

function settlementPanel(b: BookingDetail, payment: BookingPaymentRow | null) {
  const statusTone =
    payment?.status === "captured"
      ? "success"
      : payment?.status === "refunded" || payment?.status === "failed"
        ? "danger"
        : payment
          ? "neutral"
          : b.statement?.status === "draft"
            ? "neutral"
            : "success";
  const methodLine = payment
    ? [
        payment.provider,
        payment.providerPaymentId,
        payment.cardBrand
          ? `${payment.cardBrand}${payment.cardLast4 ? ` ···· ${payment.cardLast4}` : ""}`
          : payment.method,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
        <span className="text-label">Settlement</span>
        {(payment || b.statement) && (
          <Badge tone={statusTone}>
            {(payment?.status ?? b.statement?.status ?? "").toUpperCase()}
          </Badge>
        )}
      </div>
      <div className="px-5 py-4 text-sm flex flex-col gap-2">
        {payment && (
          <>
            {methodLine && (
              <Row k="Method">
                <span className="font-mono capitalize">{methodLine}</span>
              </Row>
            )}
            {payment.capturedAt && (
              <Row k="Captured">
                {dateTimeLabel(payment.capturedAt)}
                {payment.captureNote ? ` · ${payment.captureNote}` : ""}
              </Row>
            )}
          </>
        )}
        {b.statement ? (
          <Row k="Settles into">
            <span className="font-mono text-terra">{b.statement.code}</span>
            <span className="text-ink-tertiary"> · owner statement · {b.statement.status}</span>
          </Row>
        ) : !payment ? (
          <p className="text-[13px] text-ink-secondary leading-relaxed">
            No owner statement linked yet — revenue posts to the owner statement on
            the checkout date.
          </p>
        ) : null}
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

  const [audit, docsRaw, runs, party, chargeLines, payment, meta] =
    await Promise.all([
      listBookingAuditTimeline(id),
      listDocuments({ entityType: "booking", entityId: id }),
      listBookingAutomationRuns({ bookingId: id }).catch(
        () => [] as WithSource<AutomationRunRow>[],
      ),
      listBookingParty(id).catch(() => [] as BookingPartyGuest[]),
      listBookingChargeLines(id).catch(() => [] as BookingChargeLine[]),
      getBookingPayment(id).catch(() => null as BookingPaymentRow | null),
      getBookingMeta(id).catch(() => null as BookingMetaRow | null),
    ]);
  const docs = docsRaw.filter((d) => d.status !== "archived");

  const m = makeMoney(b.currency);
  const pax = (b.adults ?? 0) + (b.children ?? 0);
  const hasPax = b.adults !== null || b.children !== null;
  const selfOwner =
    !!b.owner?.email && !!b.guestEmail
      ? b.owner.email.toLowerCase() === b.guestEmail.toLowerCase()
      : false;

  // The booking-level guest (bookings.guestId) drives the title (e.g. a party
  // label); the rail's "Primary guest" prefers the named primary party member.
  const primaryParty = party.find((g) => g.role === "primary") ?? null;
  const railGuestName = primaryParty?.fullName ?? b.guestName ?? "Guest";
  const railEmail = primaryParty?.email ?? b.guestEmail;
  const railPhone = primaryParty?.phone ?? b.guestPhone;

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
      title: railGuestName,
      body: (
        <div className="flex flex-col gap-0.5">
          <span className="text-ink">{railPhone ?? "—"}</span>
          <span className="text-ink truncate">{railEmail ?? "—"}</span>
        </div>
      ),
      footer: (
        <div className="flex gap-2">
          {railEmail ? (
            <a className="btn btn-secondary btn-sm flex-1" href={`mailto:${railEmail}`}>
              Email
            </a>
          ) : (
            <button className="btn btn-secondary btn-sm flex-1 opacity-50 cursor-not-allowed" disabled>
              Email
            </button>
          )}
          {railPhone ? (
            <a
              className="btn btn-secondary btn-sm flex-1"
              href={`sms:${railPhone.replace(/[^\d+]/g, "")}`}
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
          {(() => {
            const syncedAt = meta?.syncLastAt ?? b.lastSyncedAt;
            if (!syncedAt)
              return b.channelName
                ? "No calendar sync recorded"
                : "Direct booking — no channel";
            const parts = [`Synced ${ago(syncedAt)}`];
            if (meta) {
              parts.push(`${meta.syncMessagesAutoReplied} messages auto-replied`);
              parts.push(`${meta.syncMessagesRouted} routed`);
            }
            return parts.join(" · ");
          })()}
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
      title: <>{railGuestName}</>,
      meta: primaryParty?.ownerVillaCode
        ? `OWNER OF ${primaryParty.ownerVillaCode}`
        : selfOwner && b.villaCode
          ? `OWNER OF ${b.villaCode}`
          : "PRIMARY GUEST",
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

      {chargesPanel(b, chargeLines)}

      <DetailRelated eyebrow="Also see" items={related} />
    </div>
  );

  const chargesTabPanel = (
    <div className="flex flex-col gap-6 px-7 py-6">
      {chargesPanel(b, chargeLines)}
      {settlementPanel(b, payment)}
    </div>
  );

  const adultGuests = party.filter((g) => g.kind !== "child");
  const childGuests = party.filter((g) => g.kind === "child");
  const namedCount = party.length > 0 ? adultGuests.length : b.guestName ? 1 : 0;
  const hasReq = !!meta && !!(meta.dietary || meta.mobility || meta.opsNotes);

  const guestsPanel = (
    <div className="flex flex-col gap-5 px-7 py-6">
      <div className="flex items-center justify-between">
        <span className="text-label">
          Guests <span className="text-ink-tertiary">· {namedCount} named · party of {pax}</span>
        </span>
        <AddGuestButton bookingId={b.id} />
      </div>

      {party.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {adultGuests.map((g) => (
              <div key={g.id} className="rounded-lg border border-line-soft bg-surface p-5">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-gradient-coral-soft border border-line-soft inline-flex items-center justify-center font-mono text-[12px] text-ink">
                    {initials(g.fullName)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-display text-[17px] text-ink">{g.fullName}</span>
                      {g.role === "primary" && <Badge tone="neutral">PRIMARY</Badge>}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary mt-0.5">
                      Adult
                      {g.isLeadBooker
                        ? " · Lead booker"
                        : g.role === "accompanying"
                          ? " · Accompanying"
                          : ""}
                      {g.ownerVillaCode ? ` · Owner of ${g.ownerVillaCode}` : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <Row k="Email">{g.email ?? "—"}</Row>
                  <Row k="Phone">{g.phone ?? "—"}</Row>
                  <Row k="Nationality">{g.nationality ?? "—"}</Row>
                  <Row k="ID">
                    {g.idType ? (
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={g.idVerified ? "success" : "neutral"}>
                          {g.idType.toUpperCase()}
                          {g.idVerified ? " VERIFIED" : ""}
                        </Badge>
                        {g.idLast4 && (
                          <span className="font-mono text-ink-tertiary">···· {g.idLast4}</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Row>
                </div>
              </div>
            ))}
          </div>

          {childGuests.length > 0 && (
            <div className="rounded-lg border border-line-soft bg-surface p-5">
              <div className="text-label mb-3">Children in party · no ID required</div>
              <div className="flex flex-wrap gap-6">
                {childGuests.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-muted border border-line-soft inline-flex items-center justify-center font-mono text-[10px] text-ink-secondary">
                      {initials(g.fullName)}
                    </span>
                    <div>
                      <div className="text-sm text-ink">{g.fullName}</div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
                        Child{g.ageYears != null ? ` · age ${g.ageYears}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasReq && (
            <div className="rounded-lg border border-line-soft bg-surface p-5">
              <div className="text-label mb-3">Special requirements</div>
              <div className="flex flex-col gap-2">
                {meta?.dietary && <Row k="Dietary">{meta.dietary}</Row>}
                {meta?.mobility && <Row k="Mobility">{meta.mobility}</Row>}
                {meta?.opsNotes && <Row k="Ops notes">{meta.opsNotes}</Row>}
              </div>
            </div>
          )}
        </>
      ) : b.guestName ? (
        <>
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
          <div className="rounded-md border border-line-soft bg-muted/30 p-5 text-[13px] text-ink-secondary leading-relaxed">
            Party of {pax}
            {hasPax ? ` · ${b.adults ?? 0} adult${b.adults === 1 ? "" : "s"} + ${b.children ?? 0} child${b.children === 1 ? "" : "ren"}` : ""}.
            Accompanying guests aren&rsquo;t itemised for this booking yet.
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
          No named guest on this booking.
        </div>
      )}
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
        <UploadDocButton bookingId={b.id} />
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
                <DocViewButton documentId={d.id} hasFile={d.hasFile} />
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-center">
        <p className="text-sm text-ink-secondary">Add a document</p>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-tertiary mt-1">
          PDF · JPG · PNG up to 25 MB · use Upload above
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
            <PrintFolioButton />
            {railEmail ? (
              <a className="btn btn-secondary btn-sm" href={`mailto:${railEmail}`}>
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
            <ExtendStayButton bookingId={b.id} checkIn={b.checkIn} checkOut={b.checkOut} />
            <AddChargeButton bookingId={b.id} currency={b.currency} />
          </div>
        }
      />

      <DetailMainAndSide>
        <BookingDetailTabs
          tabs={[
            { id: "overview", label: "Overview" },
            {
              id: "charges",
              label: "Charges",
              count: chargeLines.length > 0 ? chargeLines.length : chargeLineCount(b),
            },
            { id: "guests", label: "Guests", count: namedCount },
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
