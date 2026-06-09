import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyStatements } from "@/features/owner-portal/owner-portal-queries";
import {
  OwnerStatusPill,
  type OwnerStatementState,
} from "@/components/owner-portal/owner-status-pill";

/**
 * OWNER-PORTAL — Statements list (mockup Screen 1, cabinets/owner-p1/02-statement.html).
 * Narrative card rows: icon · "Period · Villa" + meta · net + ≈USD · owner-status
 * pill. The pending (awaiting) row is gold-elevated. Each row links to the
 * detail screen /owner/statements/[id].
 */
export const metadata = { title: "Statements" };
export const dynamic = "force-dynamic";

const IDR_BILLION_MINOR = 1_000_000_000_00;
const IDR_MILLION_MINOR = 1_000_000_00;
const IDR_K_MINOR = 1_000_00;

function fmtIdr(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const sign = neg ? "−" : "+";
  let body: string;
  if (abs >= BigInt(IDR_BILLION_MINOR)) body = `${(Number(abs) / IDR_BILLION_MINOR).toFixed(2)}B`;
  else if (abs >= BigInt(IDR_MILLION_MINOR)) body = `${(Number(abs) / IDR_MILLION_MINOR).toFixed(1)}M`;
  else body = `${Math.round(Number(abs) / IDR_K_MINOR)}K`;
  return `${sign}IDR ${body}`;
}

function fmtUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

interface Row {
  ownerState?: string;
  status: string;
  lineCount?: number;
  approvedAt: string | null;
  sentAt: string | null;
  ownerAckedAt?: string | null;
  autoAckAt?: string | null;
}

/** Owner-perspective meta line, mirroring the mockup's per-state copy. */
function metaLine(s: Row): string {
  const n = s.lineCount ?? 0;
  const lines = `${n} LINE${n === 1 ? "" : "S"}`;
  if (s.status === "draft") return `${lines} · DRAFT`;
  switch (s.ownerState) {
    case "acknowledged": {
      const ack = fmtDay(s.ownerAckedAt);
      const wired = fmtDay(s.sentAt);
      return [lines, ack && `ACK'D ${ack}`, wired && `WIRED ${wired}`].filter(Boolean).join(" · ");
    }
    case "auto_acknowledged": {
      const wired = fmtDay(s.sentAt);
      return [lines, "AUTO-ACK", wired && `WIRED ${wired}`].filter(Boolean).join(" · ");
    }
    case "disputed":
      return `${lines} · DISPUTED`;
    case "superseded":
      return `${lines} · REVISED & ACK'D`;
    case "viewed":
    case "pending":
    default: {
      const appr = fmtDay(s.approvedAt);
      const d = daysUntil(s.autoAckAt);
      return [lines, appr && `APPROVED ${appr}`, d != null && d > 0 && `AUTO-ACK IN ${d}D`]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

export default async function OwnerStatementsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");
  const list = await listMyStatements(owner.ownerId, { limit: 24 });

  return (
    <div data-density="narrative" className="flex flex-col">
      <div className="px-7 md:px-9 pt-7 pb-5 border-b border-line-soft bg-cream-warm">
        <div className="font-mono text-[11px] text-ink-tertiary tracking-[0.12em] uppercase mb-2">
          Your portal{owner.ownerName ? ` · ${owner.ownerName}` : ""}
        </div>
        <h1 className="owner-h1">Your statements</h1>
        <p className="owner-narr">
          {list.length === 0
            ? "No statements yet. Once your operator generates one, it will appear here."
            : `${list.length} statement${list.length === 1 ? "" : "s"} across your villas. Auto-acknowledged after 14 days if no action.`}
        </p>
      </div>

      {list.length > 0 && (
        <div className="px-7 md:px-9 py-6">
          <div className="stmt-list">
            {list.map((s) => {
              const state = (s.ownerState ?? "pending") as OwnerStatementState;
              const awaiting = (state === "pending" || state === "viewed") && s.status !== "draft";
              const disputed = state === "disputed" || state === "superseded";
              const cls = `stmt-row${awaiting ? " is-pending" : ""}${disputed ? " is-disputed" : ""}`;
              return (
                <Link key={s.statementId} href={`/owner/statements/${s.statementId}`} className={cls}>
                  <span className="sr-icon">{disputed ? <TriangleIcon /> : <DocIcon />}</span>
                  <div>
                    <div className="sr-title">
                      {s.monthLabel} · {s.villaCode ?? "—"}
                    </div>
                    <div className="sr-meta">{metaLine(s)}</div>
                  </div>
                  <div className="sr-right">
                    <div className="sr-amount">{fmtIdr(s.netToOwnerIdrMinor)}</div>
                    <div className="sr-usd">≈ {fmtUsd(s.netToOwnerUsdMinor)}</div>
                  </div>
                  <OwnerStatusPill state={state} />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
