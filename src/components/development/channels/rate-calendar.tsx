"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";

/**
 * Stage 6.P1.E.3 — Rate management calendar (basic month grid).
 *
 * Operator-facing view of per-day rates + availability. Supports:
 *   - Month navigation (today → +18 months ahead, per launch prompt)
 *   - Per-day click → edit modal
 *   - Bulk edit across selected range
 *   - "Push to channel" trigger (server action stub for P1.G to wire
 *     to the real channel.pushRates path)
 *
 * The current implementation uses local state — saves persist to a
 * server action that the operator's daily rates source eventually
 * provides (P1.G). The UI shape is stable; the persistence wire-up
 * is a later checkpoint.
 */

export interface RateCalendarProps {
  connectionId: string;
  channelLabel: string;
  baseRateUsd: number | null;
  /** Initial overrides keyed by ISO date (YYYY-MM-DD). */
  initialOverrides?: Map<
    string,
    { amount: number; currency: string; minStay?: number }
  >;
  /**
   * Server action invoked by Push to Channel + Save buttons. Receives
   * the full overrides map after the operator's edits. P1.G will wire
   * this to the ChannelManagerService.syncRates path; for now the page
   * passes a no-op stub.
   */
  onPushRates: (
    formData: FormData,
  ) => Promise<{ ok: boolean; recordsProcessed?: number; error?: string }>;
}

export function RateCalendar({
  connectionId,
  channelLabel,
  baseRateUsd,
  initialOverrides,
  onPushRates,
}: RateCalendarProps) {
  const today = new Date();
  const [cursorYear, setCursorYear] = useState(today.getUTCFullYear());
  const [cursorMonth, setCursorMonth] = useState(today.getUTCMonth());
  const [overrides, setOverrides] = useState<
    Map<string, { amount: number; currency: string; minStay?: number }>
  >(() => new Map(initialOverrides ?? []));
  const [editing, setEditing] = useState<{
    mode: "single" | "bulk";
    date?: string;
    range?: { start: string; end: string };
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const monthDays = useMemo(
    () => buildMonthDays(cursorYear, cursorMonth),
    [cursorYear, cursorMonth],
  );

  function nav(delta: number) {
    let m = cursorMonth + delta;
    let y = cursorYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setCursorYear(y);
    setCursorMonth(m);
  }

  function applyEdit(input: {
    amount: number;
    currency: string;
    minStay?: number;
    range?: { start: string; end: string };
    date?: string;
  }) {
    setOverrides((prev) => {
      const next = new Map(prev);
      const dates = input.date
        ? [input.date]
        : input.range
          ? expandRange(input.range.start, input.range.end)
          : [];
      for (const d of dates) {
        next.set(d, {
          amount: input.amount,
          currency: input.currency,
          minStay: input.minStay,
        });
      }
      return next;
    });
    setEditing(null);
  }

  function pushToChannel() {
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("connectionId", connectionId);
      fd.set("overrides", JSON.stringify(Array.from(overrides.entries())));
      const result = await onPushRates(fd);
      if (!result.ok) {
        setMessage(`Push failed: ${result.error ?? "unknown error"}`);
      } else {
        setMessage(
          `Pushed ${result.recordsProcessed ?? overrides.size} day${result.recordsProcessed === 1 ? "" : "s"} to ${channelLabel}.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-testid="rate-calendar">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => nav(-1)}
            data-testid="rate-cal-prev"
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-sm font-medium tabular-nums">
            {monthLabel(cursorYear, cursorMonth)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => nav(1)}
            data-testid="rate-cal-next"
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              setEditing({
                mode: "bulk",
                range: {
                  start: monthDays[0]?.iso ?? "",
                  end: monthDays[monthDays.length - 1]?.iso ?? "",
                },
              })
            }
            data-testid="rate-cal-bulk-edit"
          >
            Bulk edit
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={pushToChannel}
            disabled={pending}
            data-testid="rate-cal-push"
          >
            {pending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            <span className="ml-1">Push to {channelLabel}</span>
          </Button>
        </div>
      </div>

      {message && (
        <p
          className={`text-xs ${message.startsWith("Push failed") ? "text-danger" : "text-success"}`}
          data-testid="rate-cal-message"
        >
          {message}
        </p>
      )}

      <div className="grid grid-cols-7 gap-1 text-[11px] text-ink-tertiary">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthDays.map((d) =>
          d.iso === "" ? (
            <div key={`empty-${d.label}`} />
          ) : (
            <button
              key={d.iso}
              type="button"
              onClick={() => setEditing({ mode: "single", date: d.iso })}
              data-testid={`rate-cal-cell-${d.iso}`}
              className="rounded-md border border-line-soft p-1.5 text-left min-h-[60px] hover:bg-muted/30"
            >
              <div className="text-[11px] font-medium tabular-nums">{d.label}</div>
              <RateCellContents
                iso={d.iso}
                override={overrides.get(d.iso)}
                baseRateUsd={baseRateUsd}
              />
            </button>
          ),
        )}
      </div>

      <p className="text-[11px] text-ink-tertiary">
        Base rate from villa: ${baseRateUsd?.toFixed(2) ?? "—"}. Per-day
        overrides shown above the base rate. Click any day to edit.
      </p>

      {editing && (
        <RateEditModal
          mode={editing.mode}
          date={editing.date}
          range={editing.range}
          baseRateUsd={baseRateUsd}
          onClose={() => setEditing(null)}
          onApply={applyEdit}
        />
      )}

      <div className="text-xs">
        <Link
          href={`/development-os/channels/${connectionId}`}
          className="hover:underline text-ink-secondary"
        >
          ← Back to connection
        </Link>
      </div>
    </div>
  );
}

function RateCellContents({
  iso,
  override,
  baseRateUsd,
}: {
  iso: string;
  override?: { amount: number; currency: string; minStay?: number };
  baseRateUsd: number | null;
}) {
  void iso;
  if (override) {
    return (
      <div className="text-[11px] mt-0.5 text-ink">
        <div className="font-mono tabular-nums">
          ${override.amount.toFixed(2)} {override.currency}
        </div>
        {override.minStay && (
          <div className="text-[10px] text-ink-tertiary">
            min {override.minStay}n
          </div>
        )}
      </div>
    );
  }
  if (baseRateUsd != null) {
    return (
      <div className="text-[10px] text-ink-tertiary mt-0.5 font-mono">
        base ${baseRateUsd.toFixed(0)}
      </div>
    );
  }
  return null;
}

function RateEditModal({
  mode,
  date,
  range,
  baseRateUsd,
  onClose,
  onApply,
}: {
  mode: "single" | "bulk";
  date?: string;
  range?: { start: string; end: string };
  baseRateUsd: number | null;
  onClose: () => void;
  onApply: (input: {
    amount: number;
    currency: string;
    minStay?: number;
    range?: { start: string; end: string };
    date?: string;
  }) => void;
}) {
  return (
    <EntityModal
      open
      onClose={onClose}
      title={mode === "single" ? `Edit rate · ${date}` : "Bulk edit rates"}
      size="sm"
    >
      <form
        action={(fd) => {
          const amount = Number(fd.get("amount") ?? "");
          const currency = String(fd.get("currency") ?? "USD");
          const minStayRaw = String(fd.get("minStay") ?? "").trim();
          if (!isFinite(amount) || amount <= 0) return;
          onApply({
            amount,
            currency,
            minStay: minStayRaw ? Number(minStayRaw) : undefined,
            date,
            range,
          });
        }}
        className="space-y-3"
      >
        {mode === "bulk" && range && (
          <p className="text-xs text-ink-tertiary">
            Applying to {range.start} → {range.end}
          </p>
        )}
        <Field label="Amount">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={baseRateUsd ?? ""}
            className={inputCls}
            data-testid="rate-edit-amount"
          />
        </Field>
        <Field label="Currency">
          <select
            name="currency"
            required
            defaultValue="USD"
            className={inputCls}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="IDR">IDR</option>
          </select>
        </Field>
        <Field label="Minimum stay (optional)">
          <input
            name="minStay"
            type="number"
            min="1"
            className={inputCls}
            placeholder="e.g. 3"
          />
        </Field>
        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" size="sm" data-testid="rate-edit-apply">
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </EntityModal>
  );
}

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-xs min-h-[36px]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Pure date helpers (kept local — small enough not to extract)
// ---------------------------------------------------------------------------

function buildMonthDays(
  year: number,
  monthZeroBased: number,
): Array<{ iso: string; label: string }> {
  const first = new Date(Date.UTC(year, monthZeroBased, 1));
  const dayOfWeek = first.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(year, monthZeroBased + 1, 0),
  ).getUTCDate();
  const out: Array<{ iso: string; label: string }> = [];
  for (let i = 0; i < dayOfWeek; i++) out.push({ iso: "", label: String(i) });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthZeroBased + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    out.push({ iso, label: String(d) });
  }
  return out;
}

function monthLabel(year: number, monthZeroBased: number): string {
  const date = new Date(Date.UTC(year, monthZeroBased, 1));
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function expandRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out;
  for (let d = start.getTime(); d <= end.getTime(); d += 86_400_000) {
    out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}
