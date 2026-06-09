import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  getPricingRuleSetById,
  listPricingRulesForSet,
} from "@/features/dynamic-pricing/services";

export const metadata = { title: "Rule set detail" };
export const dynamic = "force-dynamic";

type RuleStackRow = {
  prio: string;
  when: string;
  desc: string;
  meta: string;
  delta: string;
  kindClass?: string;
  disabled?: boolean;
  pinned?: boolean;
};

export default async function RuleSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const set = await getPricingRuleSetById(id);
  if (!set) notFound();
  const rules = await listPricingRulesForSet(id);
  const cur = set.currency;

  /* ---- flatten every rule family into one ordered stack (mock §03) ---- */
  const stack: RuleStackRow[] = [];
  for (const r of rules.dayOfWeek)
    stack.push({
      prio: "DOW",
      when: "day-of-week",
      desc: weekdayLabel(r.weekday),
      meta: r.minLos != null ? `min LOS ${r.minLos}` : "weekday rate",
      delta: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
      disabled: r.status !== "active",
    });
  for (const r of rules.occupancy)
    stack.push({
      prio: "OCC",
      when: "occupancy tier",
      desc: `${pct(r.occupancyMin)} – ${pct(r.occupancyMax)} forward occupancy`,
      meta: "demand multiplier",
      delta: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
      disabled: r.status !== "active",
    });
  for (const r of rules.closeOut)
    stack.push({
      prio: "LEAD",
      when: r.modifierType === "stop_sell" ? "close-out" : "lead time",
      desc: `${r.daysBeforeCheckinMin}–${r.daysBeforeCheckinMax} days before check-in`,
      meta: r.minLos != null ? `min LOS ${r.minLos}` : "days-until-checkin",
      delta:
        r.modifierType === "stop_sell"
          ? "stop-sell"
          : formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
      kindClass: r.modifierType === "stop_sell" ? "rr-kind-floor" : undefined,
      disabled: r.status !== "active",
    });
  for (const r of rules.channels)
    stack.push({
      prio: "CHAN",
      when: "channel",
      desc: r.channelKey,
      meta: r.commissionModel ?? "channel rate",
      delta: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
      disabled: r.status !== "active",
    });
  for (const r of rules.minStay)
    stack.push({
      prio: "LOS",
      when: "min-stay",
      desc: r.name,
      meta:
        [r.startsOn, r.endsOn].filter(Boolean).join(" → ") +
        (r.weekdayMask?.length ? ` · weekdays ${r.weekdayMask.join(",")}` : ""),
      delta: `min ${r.minLos}n`,
      disabled: r.status !== "active",
    });
  for (const r of rules.stopSell)
    stack.push({
      prio: "BLOCK",
      when: "stop-sell",
      desc: r.name,
      meta: `${r.startsOn} → ${r.endsOn}${r.channelKey ? ` · ${r.channelKey}` : ""}`,
      delta: r.reason.replace(/_/g, " "),
      kindClass: "rr-kind-floor",
      disabled: r.status !== "active",
      pinned: true,
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header !mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> /{" "}
            <Link href="/dashboard/pricing/rule-sets">Rule sets</Link> /{" "}
            <span>{set.name}</span>
          </div>
          <h1>{set.name}</h1>
          <p className="font-mono text-[12px] text-ink-3 mt-2">
            {set.scopeType} · priority {set.priority} · {set.ruleSetCode}
          </p>
        </div>
        <div className="actions">
          <Badge
            tone={set.status === "active" ? "success" : set.status === "paused" ? "warning" : "neutral"}
          >
            {set.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Rule stack — every family, in priority order */}
        <div>
          <div className="label text-[9.5px] mb-2.5">
            Rules · {stack.length} · order matters (top wins)
          </div>
          {stack.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-soft bg-cream-warm/40 px-5 py-6 text-sm text-ink-3">
              No rules configured — base rate applies.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stack.map((d, i) => (
                <div
                  key={i}
                  className={`rule-row${d.disabled ? " is-disabled" : ""}${d.pinned ? " is-pinned" : ""}`}
                >
                  <span className="rr-prio">{d.prio}</span>
                  <span className={`rr-kind${d.kindClass ? ` ${d.kindClass}` : ""}`}>{d.when}</span>
                  <span className="rr-cond">{d.desc}</span>
                  <span className="rr-effect">{d.meta}</span>
                  <span className="rr-delta">{d.delta}</span>
                  <span className="rr-actions" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Base / clamps card */}
        <div className="card card-pad">
          <div className="label text-[9.5px] mb-3.5">Base rate / clamps</div>
          <dl className="flex flex-col gap-3 m-0">
            <Field label="Base" value={`${formatMoney(set.baseRateMinor)} ${cur}`} />
            <Field
              label="Min clamp"
              value={set.minRateMinor != null ? `${formatMoney(set.minRateMinor)} ${cur}` : "—"}
            />
            <Field
              label="Max clamp"
              value={set.maxRateMinor != null ? `${formatMoney(set.maxRateMinor)} ${cur}` : "—"}
            />
            <Field label="Project" value={set.projectId ?? "—"} />
            <Field label="Villa" value={set.villaId ?? "—"} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-line-soft last:border-b-0 last:pb-0">
      <dt className="field-label">{label}</dt>
      <dd className="m-0 font-mono text-[12px] text-ink tabular-nums text-right break-all">{value}</dd>
    </div>
  );
}

function weekdayLabel(w: number): string {
  return ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][w] ?? `Day ${w}`;
}

function pct(n: string | number | null): string {
  if (n == null) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}

function formatModifier(
  type: string,
  valueNumeric: string | null,
  amountMinor: bigint | null,
): string {
  if (type === "percent") {
    if (valueNumeric == null) return "0%";
    const v = Number(valueNumeric);
    return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  }
  if (type === "fixed") {
    if (amountMinor == null) return "0";
    const sign = amountMinor < 0n ? "-" : "+";
    const abs = amountMinor < 0n ? -amountMinor : amountMinor;
    return `${sign}${formatMoney(abs)}`;
  }
  return type;
}

function formatMoney(amount: bigint): string {
  const major = amount / 100n;
  const minor = amount % 100n;
  const sign = amount < 0n ? "-" : "";
  const abs = amount < 0n ? -major : major;
  const minorAbs = amount < 0n ? -minor : minor;
  return `${sign}${abs.toString()}.${String(minorAbs).padStart(2, "0")}`;
}
