import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import {
  quoteDynamicCalendar,
  listPricingRulesForSet,
  type QuoteCalendarCell,
} from "@/features/dynamic-pricing/services";
import { VillaPicker } from "./_villa-picker";
import { RateCurve } from "./_rate-curve";
import { CompTable, type CompRow } from "@/components/pricing/comp-table";
import { buildPricingRecommendations } from "@/features/dynamic-pricing/recommendations";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

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
  const { allowed } = await requireCabinetAccess("pricing");
  if (!allowed) return <CabinetGate cabinet="Dynamic pricing" />;
  const sp = (await searchParams) ?? {};
  const villas = await listVillas().catch(() => []);
  const selectedVillaId =
    sp.villa && villas.some((v) => v.id === sp.villa) ? sp.villa : villas[0]?.id ?? null;
  const selectedVilla = villas.find((v) => v.id === selectedVillaId) ?? null;

  /* ---- comp set: portfolio peers (same project or bedroom count) ---- */
  const compRows: CompRow[] = selectedVilla
    ? [
        {
          id: selectedVilla.id,
          isUs: true,
          name: selectedVilla.unitCode,
          source: "us",
          similarity: 1,
          adrUsd: selectedVilla.currentNightlyRateUsd ?? 0,
          beds: selectedVilla.bedrooms,
        },
        ...villas
          .filter(
            (v) =>
              v.status !== "archived" &&
              v.id !== selectedVilla.id &&
              (v.projectId === selectedVilla.projectId ||
                v.bedrooms === selectedVilla.bedrooms),
          )
          .map<CompRow>((v) => {
            const sameProject = v.projectId === selectedVilla.projectId;
            const sameBeds = v.bedrooms === selectedVilla.bedrooms;
            return {
              id: v.id,
              isUs: false,
              name: v.unitCode,
              source: "peer",
              similarity: sameProject && sameBeds ? 0.95 : sameBeds ? 0.8 : 0.6,
              adrUsd: v.currentNightlyRateUsd ?? 0,
              beds: v.bedrooms,
            };
          }),
      ]
    : [];
  const peerAdrs = compRows
    .filter((r) => !r.isUs && r.adrUsd > 0)
    .map((r) => r.adrUsd)
    .sort((a, b) => a - b);
  const peerMedian = peerAdrs.length
    ? peerAdrs.length % 2 === 1
      ? peerAdrs[(peerAdrs.length - 1) / 2]
      : Math.round(
          (peerAdrs[peerAdrs.length / 2 - 1] + peerAdrs[peerAdrs.length / 2]) / 2,
        )
    : 0;
  const usAdr = compRows.find((r) => r.isUs)?.adrUsd ?? 0;
  const compIndex =
    peerMedian > 0 && usAdr > 0 ? Math.round((usAdr / peerMedian) * 100) : null;

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

  // Pricing assistant — deterministic recommendations over the live curve.
  const pricingRecs =
    cells.length > 0
      ? buildPricingRecommendations({
          cells,
          baseMinor,
          currency,
          compIndexPct: compIndex != null ? compIndex - 100 : 0,
        })
      : [];
  const REC_TONE: Record<string, string> = {
    opportunity: "border-success/40 bg-success/5",
    watch: "border-warning/40 bg-warning-weak/40",
    info: "border-line-soft bg-muted/30",
  };

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

  /* ---- rate-curve data (geometry + drag live in <RateCurve>) ---- */
  const baseVal = Number(baseMinor) / 100;
  const curveCells = cells.map((c) => ({
    date: c.date,
    available: c.available,
    finalRate: Number(c.finalRateMinor) / 100,
    override: c.overrideMinor !== null ? Number(c.overrideMinor) / 100 : null,
  }));

  return (
    <>
      <div className="page-header !mb-0 !pb-[18px]">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Revenue</Link> / <span>Dynamic pricing</span>
          </div>
          <h1>Dynamic pricing</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[720px]">
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-[18px] mb-[18px]">
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
        <Kpi
          label="Comp index"
          value={compIndex != null ? String(compIndex) : "—"}
          sub={compIndex != null ? "100 = at peer median" : "no priced peers"}
          tone={compIndex != null ? "accent" : undefined}
        />
      </div>

      {/* Rate curve — PricingCurve (.pc-*) primitive shell around the live, drag-editable curve */}
      <div className="pc-wrap mb-[18px]">
        <div className="pc-head">
          <div className="min-w-0 flex-1">
            <div className="label text-[9.5px] mb-1">
              {selectedVilla?.unitCode ?? "—"} · next {cells.length || DAYS} nights forward
            </div>
            <div className="title">Rate curve — {currency} · base + active + overrides</div>
          </div>
          <div className="legend">
            <span className="it">
              <span className="ln pc-ln-active" /> active (push)
            </span>
            <span className="it">
              <span className="ln dash pc-ln-base" /> base
            </span>
            <span className="it">
              <span className="ln pc-ln-stop" /> stop-sell
            </span>
          </div>
        </div>
        {cells.length === 0 ? (
          <p className="py-6 text-[13px] text-ink-3 italic m-0">
            {ruleSet
              ? "No nightly quotes for this window."
              : "No active rule set for this villa — nothing to chart yet."}
          </p>
        ) : (
          <RateCurve
            villaId={selectedVillaId ?? ""}
            currency={currency}
            baseRate={baseVal}
            cells={curveCells}
          />
        )}
        {cells.length > 0 && (
          <div className="pc-controls">
            <span className="font-mono text-[10.5px] text-ink-4">
              {overrideCount} active block{overrideCount === 1 ? "" : "s"} · drag a point to pin a nightly
              override · click the ✕ on a pin to clear
            </span>
          </div>
        )}
      </div>

      {/* Pricing assistant — recommendations over the live curve */}
      {pricingRecs.length > 0 && (
        <div className="card card-pad mb-[18px]">
          <div className="flex items-baseline gap-2 mb-3.5">
            <span className="label text-[9.5px]">Pricing assistant</span>
            <span className="font-mono text-[11px] text-ink-4">
              {pricingRecs.length} recommendation{pricingRecs.length === 1 ? "" : "s"} · next {DAYS} nights
            </span>
          </div>
          <ul className="flex flex-col gap-2 m-0 p-0 list-none">
            {pricingRecs.map((r) => (
              <li
                key={r.kind}
                className={`rounded-md border px-3.5 py-2.5 ${REC_TONE[r.tone] ?? REC_TONE.info}`}
              >
                <div className="text-[13px] font-medium text-ink">{r.title}</div>
                <div className="text-xs text-ink-secondary mt-0.5">{r.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rule stack + comp set */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 mb-[18px]">
        <div className="card card-pad">
          <div className="flex items-baseline justify-between mb-3.5">
            <span className="label text-[9.5px]">
              Active rules · {ruleRows.length}
            </span>
            {ruleSet && (
              <Link
                href={`/dashboard/pricing/rule-sets/${ruleSet.id}`}
                className="font-mono text-[11px] text-ink-3 no-underline hover:text-ink"
              >
                manage all rules →
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2">
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

        <div className="card card-pad">
          <div className="flex items-baseline justify-between mb-3.5">
            <span className="label text-[9.5px]">Comp set · portfolio peers</span>
            <span className="font-mono text-[11px] text-ink-4">
              {Math.max(0, compRows.length - 1)} peer
              {compRows.length - 1 === 1 ? "" : "s"}
            </span>
          </div>
          {compRows.length <= 1 ? (
            <div className="text-[13px] text-ink-3 italic leading-relaxed">
              No comparable villas — peers are sibling villas in the same project or
              with the same bedroom count. (External-channel competitor rates would
              need a comp feed, which isn&rsquo;t integrated.)
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-5">
                <CompTable rows={compRows} />
              </div>
              {peerMedian > 0 && compIndex != null && (
                <div className="mt-3.5 px-3 py-2.5 bg-cream-warm rounded-md font-mono text-[10.5px] text-ink-3 leading-relaxed">
                  median ${peerMedian} · we{" "}
                  {compIndex >= 100 ? "sit above" : "sit below"} median by{" "}
                  {Math.abs(compIndex - 100)}% · pricing power{" "}
                  {compIndex >= 100 ? "↑" : "↓"}
                </div>
              )}
            </>
          )}
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
