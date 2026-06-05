import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getPricingRuleSetById,
  listPricingRulesForSet,
} from "@/features/dynamic-pricing/services";

export const metadata = { title: "Rule set detail" };
export const dynamic = "force-dynamic";

export default async function RuleSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const set = await getPricingRuleSetById(id);
  if (!set) notFound();
  const rules = await listPricingRulesForSet(id);
  return (
    <div className="flex flex-col gap-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
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

      <Section eyebrow="Base" title="Base rate / clamps">
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Base" value={`${formatMoney(set.baseRateMinor)} ${set.currency}`} mono />
          <Field
            label="Min clamp"
            value={set.minRateMinor != null ? `${formatMoney(set.minRateMinor)} ${set.currency}` : "—"}
            mono
          />
          <Field
            label="Max clamp"
            value={set.maxRateMinor != null ? `${formatMoney(set.maxRateMinor)} ${set.currency}` : "—"}
            mono
          />
          <Field label="Project" value={set.projectId ?? "—"} mono />
          <Field label="Villa" value={set.villaId ?? "—"} mono />
        </dl>
      </Section>

      <Section eyebrow="Day of week" title={`${rules.dayOfWeek.length} rules`}>
        <RuleTable
          rows={rules.dayOfWeek.map((r) => ({
            label: weekdayLabel(r.weekday),
            modifier: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
            extra: r.minLos != null ? `min LOS ${r.minLos}` : "",
            status: r.status,
          }))}
        />
      </Section>

      <Section eyebrow="Occupancy" title={`${rules.occupancy.length} rules`}>
        <RuleTable
          rows={rules.occupancy.map((r) => ({
            label: `${pct(r.occupancyMin)} – ${pct(r.occupancyMax)}`,
            modifier: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
            extra: "",
            status: r.status,
          }))}
        />
      </Section>

      <Section eyebrow="Close-out" title={`${rules.closeOut.length} rules`}>
        <RuleTable
          rows={rules.closeOut.map((r) => ({
            label: `${r.daysBeforeCheckinMin}–${r.daysBeforeCheckinMax} days before`,
            modifier:
              r.modifierType === "stop_sell"
                ? "stop sell"
                : formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
            extra: r.minLos != null ? `min LOS ${r.minLos}` : "",
            status: r.status,
          }))}
        />
      </Section>

      <Section eyebrow="Channels" title={`${rules.channels.length} rules`}>
        <RuleTable
          rows={rules.channels.map((r) => ({
            label: r.channelKey,
            modifier: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
            extra: r.commissionModel ?? "",
            status: r.status,
          }))}
        />
      </Section>

      <Section eyebrow="Min stay" title={`${rules.minStay.length} rules`}>
        <RuleTable
          rows={rules.minStay.map((r) => ({
            label: r.name,
            modifier: `${r.minLos} nights`,
            extra:
              [r.startsOn, r.endsOn].filter(Boolean).join(" → ") +
              (r.weekdayMask?.length ? ` · weekdays ${r.weekdayMask.join(",")}` : ""),
            status: r.status,
          }))}
        />
      </Section>

      <Section eyebrow="Stop sell" title={`${rules.stopSell.length} rules`}>
        <RuleTable
          rows={rules.stopSell.map((r) => ({
            label: r.name,
            modifier: r.reason,
            extra: `${r.startsOn} → ${r.endsOn}${r.channelKey ? ` · ${r.channelKey}` : ""}`,
            status: r.status,
          }))}
        />
      </Section>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</dd>
    </div>
  );
}

function RuleTable({
  rows,
}: {
  rows: { label: string; modifier: string; extra: string; status: string }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        None configured.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line-soft first:border-t-0">
              <td className="px-4 py-3 text-ink">{r.label}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.modifier}</td>
              <td className="px-4 py-3 text-xs text-ink-tertiary">{r.extra}</td>
              <td className="px-4 py-3">
                <Badge tone={r.status === "active" ? "success" : r.status === "paused" ? "warning" : "neutral"}>
                  {r.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
