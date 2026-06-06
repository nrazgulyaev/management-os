import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import {
  quoteDynamicCalendar,
  listPricingRulesForSet,
  type QuoteCalendarCell,
} from "@/features/dynamic-pricing/services";
import { VillaPicker } from "./_villa-picker";

/**
 * Dynamic pricing — per-villa "production view" (prototype mgmt-p2).
 *
 * Villa picker → 60-night forward rate curve (base + active price, stop-sell
 * markers) → active rule stack (the .rule-row primitives) → comp set. All on
 * the live pricing engine (`quoteDynamicCalendar` + `listPricingRulesForSet`).
 * Comp set has no data source yet, so it empty-states.
 */

export const metadata = { title: "Dynamic pricing" };
export const dynamic = "force-dynamic";

const DAYS = 60;
const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function money(minor: bigint, currency: string): string {
  const v = Number(minor) / 100;
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${currency} ${(v / 1000).toFixed(0)}k`;
  return `${currency} ${Math.round(v)}`;
}

function fmtMod(
  type: string,
  valueNumeric: string | number | null,
  amountMinor: bigint | null,
  currency: string,
): string {
  if (type === "percent") {
    const v = Number(valueNumeric ?? 0);
    return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
  }
  if (type === "fixed") {
    const amt = amountMinor ?? 0n;
    const sign = amt < 0n ? "−" : "+";
    return `${sign}${money(amt < 0n ? -amt : amt, currency)}`;
  }
  if (type === "stop_sell") return "stop-sell";
  return type;
}

function dLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

type RuleRow = {
  prio: string;
  kind: string;
  kindClass?: string;
  cond: string;
  effect: string;
  delta: string;
  disabled?: boolean;
  pinned?: boolean;
};

export default async function PricingProductionView({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const villas = await listVillas().catch(() => []);
  const selectedVillaId =
    sp.villa && villas.some((v) => v.id === sp.villa) ? sp.villa : villas[0]?.id ?? null;
  const selectedVilla = villas.find((v) => v.id === selectedVillaId) ?? null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const { ruleSet, cells } = selectedVillaId
    ? await quoteDynamicCalendar({
        villaId: selectedVillaId,
        startDate: todayIso,
        days: DAYS,
      }).catch(() => ({ ruleSet: null, cells: [] as QuoteCalendarCell[] }))
    : { ruleSet: null, cells: [] as QuoteCalendarCell[] };

  const rules = ruleSet ? await listPricingRulesForSet(ruleSet.id).catch(() => null) : null;

  const currency = ruleSet?.currency ?? "USD";
  const baseMinor = ruleSet?.baseRateMinor ?? 0n;
  const available = cells.filter((c) => c.available);
  const stopSellNights = cells.length - available.length;
  const adr30 = (() => {
    const slice = available.slice(0, 30);
    if (slice.length === 0) return 0n;
    return slice.reduce((s, c) => s + c.finalRateMinor, 0n) / BigInt(slice.length);
  })();
  const adrVsBase =
    baseMinor > 0n ? Math.round((Number(adr30 - baseMinor) / Number(baseMinor)) * 100) : 0;
  const overrideCount =
    (rules?.stopSell.length ?? 0) +
    (rules?.closeOut.filter((r) => r.modifierType === "stop_sell").length ?? 0);

  /* ---- flatten rule families into display rows ---- */
  const ruleRows: RuleRow[] = [];
  if (rules) {
    for (const r of rules.dayOfWeek)
      ruleRows.push({
        prio: "DOW",
        kind: "Day",
        cond: WEEKDAYS[r.weekday] ?? `Day ${r.weekday}`,
        effect: "weekday rate",
        delta: fmtMod(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor, currency),
        disabled: r.status !== "active",
      });
    for (const r of rules.occupancy)
      ruleRows.push({
        prio: "OCC",
        kind: "Occupancy",
        cond: `${Math.round(Number(r.occupancyMin) * 100)}–${Math.round(Number(r.occupancyMax) * 100)}% occ`,
        effect: "demand",
        delta: fmtMod(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor, currency),
        disabled: r.status !== "active",
      });
    for (const r of rules.closeOut)
      ruleRows.push({
        prio: "LEAD",
        kind: r.modifierType === "stop_sell" ? "Close-out" : "Lead",
        kindClass: r.modifierType === "stop_sell" ? "rr-kind-floor" : undefined,
        cond: `${r.daysBeforeCheckinMin}–${r.daysBeforeCheckinMax}d before`,
        effect: "lead time",
        delta: fmtMod(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor, currency),
        disabled: r.status !== "active",
      });
    for (const r of rules.channels)
      ruleRows.push({
        prio: "CHAN",
        kind: "Channel",
        cond: r.channelKey,
        effect: r.commissionModel ?? "channel rate",
        delta: fmtMod(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor, currency),
        disabled: r.status !== "active",
      });
    for (const r of rules.minStay)
      ruleRows.push({
        prio: "LOS",
        kind: "Min-stay",
        cond: r.name,
        effect: [r.startsOn, r.endsOn].filter(Boolean).join(" → ") || "always",
        delta: `min ${r.minLos}n`,
        disabled: r.status !== "active",
      });
    for (const r of rules.stopSell)
      ruleRows.push({
        prio: "BLOCK",
        kind: "Stop-sell",
        kindClass: "rr-kind-floor",
        cond: r.name,
        effect: `${r.startsOn} → ${r.endsOn}${r.channelKey ? ` · ${r.channelKey}` : ""}`,
        delta: r.reason.replace(/_/g, " "),
        disabled: r.status !== "active",
        pinned: true,
      });
  }

  /* ---- rate-curve geometry ---- */
  const prices = cells.map((c) => Number(c.finalRateMinor) / 100);
  const baseVal = Number(baseMinor) / 100;
  const vals = [...prices.filter((p) => p > 0), ...(baseVal > 0 ? [baseVal] : [])];
  const maxP = vals.length ? Math.max(...vals) * 1.12 : 100;
  const minP = vals.length ? Math.min(...vals) * 0.88 : 0;
  const span = Math.max(1, maxP - minP);
  const W = 920,
    H = 280,
    padL = 50,
    padR = 14,
    padT = 18,
    padB = 32;
  const n = cells.length;
  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const yAt = (p: number) => padT + (1 - (p - minP) / span) * (H - padT - padB);
  const activePath = cells
    .map((c, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)},${yAt(prices[i] || baseVal).toFixed(1)}`)
    .join(" ");
  const areaPath =
    n > 0
      ? `${activePath} L ${xAt(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L ${xAt(0).toFixed(1)},${(H - padB).toFixed(1)} Z`
      : "";
  const baseY = yAt(baseVal);
  const yTicks = [0, 1, 2, 3].map((k) => minP + (span * k) / 3);
  const xTickIdx = n > 0 ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1] : [];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <span className="text-ink-4">Revenue</span> / <span>Dynamic pricing</span>
          </div>
          <h1>Dynamic pricing</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[720px]">
            Algo + manual rules drive what Channels pushes.{" "}
            {ruleSet
              ? `${overrideCount} active block${overrideCount === 1 ? "" : "s"} · base ${money(baseMinor, currency)} · ${available.length}/${cells.length} nights bookable.`
              : "This villa has no active rule set — prices fall back to the base rate."}
          </p>
        </div>
        <div className="actions">
          {villas.length > 0 && selectedVillaId && (
            <VillaPicker
              selected={selectedVillaId}
              villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
            />
          )}
          <Link href="/dashboard/pricing/quote" className="btn btn-secondary btn-sm">
            Run engine
          </Link>
          <Link href="/dashboard/pricing/channel-push" className="btn btn-accent btn-sm">
            Push to channels
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Base · nightly" value={ruleSet ? money(baseMinor, currency) : "—"} sub="rule-set base" />
        <Kpi
          label="Active · 30d ADR"
          value={ruleSet && adr30 > 0n ? money(adr30, currency) : "—"}
          sub={ruleSet ? `${adrVsBase >= 0 ? "+" : ""}${adrVsBase}% vs base` : "no rule set"}
          tone="accent"
        />
        <Kpi label="Blocks / overrides" value={String(overrideCount)} sub="stop-sell + close-out" />
        <Kpi
          label="Stop-sell nights"
          value={String(stopSellNights)}
          sub={`of next ${cells.length || DAYS}`}
          tone={stopSellNights > 0 ? "gold" : undefined}
        />
        <Kpi label="Comp index" value="—" sub="comp set not integrated" />
      </div>

      {/* Rate curve */}
      <div className="rounded-lg border border-line-soft bg-surface overflow-hidden mb-[18px]">
        <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between flex-wrap gap-2">
          <span className="text-label">
            Rate curve{" "}
            <span className="text-ink-tertiary">
              · {selectedVilla?.unitCode ?? "—"} · next {cells.length || DAYS} nights ({currency})
            </span>
          </span>
          <div className="flex items-center gap-4 text-[11px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-[2px]" style={{ background: "var(--terra)" }} /> Active (push)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-[2px] border-t border-dashed" style={{ borderColor: "var(--ink-3)" }} /> Base
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--danger)" }} /> Stop-sell
            </span>
          </div>
        </div>
        {cells.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-3 italic m-0">
            {ruleSet
              ? "No nightly quotes for this window."
              : "No active rule set for this villa — nothing to chart yet."}
          </p>
        ) : (
          <div className="overflow-x-auto px-2 py-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[680px]" style={{ height: 280 }}>
              {/* gridlines + y labels */}
              {yTicks.map((p, k) => (
                <g key={k}>
                  <line x1={padL} y1={yAt(p)} x2={W - padR} y2={yAt(p)} stroke="var(--line-soft)" strokeWidth="1" />
                  <text x={padL - 8} y={yAt(p) + 3} textAnchor="end" fontFamily="var(--mono-font)" fontSize="10" fill="var(--ink-4)">
                    {money(BigInt(Math.round(p * 100)), currency)}
                  </text>
                </g>
              ))}
              {/* x date labels */}
              {xTickIdx.map((i) => (
                <text
                  key={i}
                  x={xAt(i)}
                  y={H - 8}
                  textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                  fontFamily="var(--mono-font)"
                  fontSize="9"
                  fill="var(--ink-4)"
                >
                  {dLabel(cells[i].date)}
                </text>
              ))}
              {/* area fill under the active curve */}
              {areaPath && <path d={areaPath} fill="var(--terra)" fillOpacity="0.06" />}
              {/* base flat line */}
              {baseVal > 0 && (
                <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 4" />
              )}
              {/* active curve */}
              <path d={activePath} fill="none" stroke="var(--terra)" strokeWidth="2.5" strokeLinejoin="round" />
              {/* stop-sell markers */}
              {cells.map((c, i) =>
                !c.available ? (
                  <circle key={i} cx={xAt(i)} cy={padT + 4} r="3" fill="var(--danger)" />
                ) : null,
              )}
              {/* today marker — label sits at the bottom of the line, clear of the y-axis labels */}
              <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--terra)" strokeWidth="1" />
              <text x={padL + 4} y={H - padB - 6} fontFamily="var(--mono-font)" fontSize="9" fill="var(--terra)">
                today
              </text>
            </svg>
          </div>
        )}
      </div>

      {/* Rule stack + comp set */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 mb-[18px]">
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
            <span className="text-label">
              Active rules <span className="text-ink-tertiary">· {ruleRows.length}</span>
            </span>
            {ruleSet && (
              <Link
                href={`/dashboard/pricing/rule-sets/${ruleSet.id}`}
                className="font-mono text-[11px] text-ink-3 hover:text-ink"
              >
                manage all rules →
              </Link>
            )}
          </div>
          <div className="p-3.5 flex flex-col gap-2">
            {ruleRows.length === 0 ? (
              <p className="text-[13px] text-ink-3 italic m-0 px-1 py-2">
                {ruleSet ? "No rules configured — base rate applies." : "No rule set assigned to this villa."}
              </p>
            ) : (
              ruleRows.map((d, i) => (
                <div
                  key={i}
                  className={`rule-row${d.disabled ? " is-disabled" : ""}${d.pinned ? " is-pinned" : ""}`}
                >
                  <span className="rr-prio">{d.prio}</span>
                  <span className={`rr-kind${d.kindClass ? ` ${d.kindClass}` : ""}`}>{d.kind}</span>
                  <span className="rr-cond">{d.cond}</span>
                  <span className="rr-effect">{d.effect}</span>
                  <span className="rr-delta">{d.delta}</span>
                  <span className="rr-actions" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line-soft">
            <span className="text-label">Comp set</span>
          </div>
          <div className="p-6 text-[13px] text-ink-secondary leading-relaxed">
            Competitor pricing isn&rsquo;t integrated yet. Once a comp-set feed lands, the
            similarity scorer ranks nearby villas by bedrooms, capacity, location, and ADR —
            and a comp-median line overlays the rate curve above.
          </div>
        </div>
      </div>

      {/* Surfaces */}
      <h2 className="display text-[22px] font-normal mt-2 mb-3">More pricing tools</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <HubLink href="/dashboard/pricing/rule-sets" title="Rule sets" description="Scope, priority, base rate, and rule families." />
        <HubLink href="/dashboard/pricing/calendar" title="Calendar" description="Multi-villa nightly calendar + availability." />
        <HubLink href="/dashboard/pricing/quote" title="Quote tester" description="Run a stay against a villa + channel." />
        <HubLink href="/dashboard/pricing/logs" title="Quote logs" description="Public + admin quote observability." />
        <HubLink href="/dashboard/pricing/channel-push" title="Channel push" description="Simulate outbound rate / availability pushes." />
        <HubLink href="/dashboard/bookings/rates" title="Legacy rate plans" description="Rate plans + seasons + overrides." />
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "accent" | "gold";
}) {
  return <div className={`kpi${tone ? ` ${tone}` : ""}`}><div className="label">{label}</div><div className="v">{value}</div><div className="sub">{sub}</div></div>;
}

function HubLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-4 hover:border-line-strong transition-colors"
    >
      <div className="text-sm text-ink font-medium">{title}</div>
      <div className="text-xs text-ink-tertiary mt-1">{description}</div>
    </Link>
  );
}
