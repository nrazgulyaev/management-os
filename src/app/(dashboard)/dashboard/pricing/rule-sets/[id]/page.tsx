import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";
import {
  getApplicablePricingRuleSet,
  getPricingRuleSetById,
  listPricingRulesForSet,
} from "@/features/dynamic-pricing/services";
import { listVillas } from "@/features/villas/services";
import { requireOrgId } from "@/features/auth/require-org";
import {
  AddRuleEditor,
  ArchiveRuleButton,
  RuleSetLifecycle,
  RuleSetSettingsForm,
  type RuleFamily,
} from "./_editor";

export const metadata = { title: "Rule set detail" };
export const dynamic = "force-dynamic";

type RuleStackRow = {
  ruleType: RuleFamily;
  id: string;
  status: string;
  kind: string;
  kindClass?: string;
  cond: string;
  window: string;
  delta: string;
  pinned?: boolean;
};

export default async function RuleSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrgId();
  const set = await getPricingRuleSetById(id);
  if (!set) notFound();
  const [rules, villas] = await Promise.all([
    listPricingRulesForSet(id, organizationId),
    listVillas().catch(() => []),
  ]);
  const cur = set.currency;

  /* ---- live-preview link: first covered villa whose APPLICABLE set is this one ---- */
  const coveredVillas =
    set.scopeType === "villa"
      ? villas.filter((v) => v.id === set.villaId)
      : set.scopeType === "project"
        ? villas.filter((v) => v.projectId === set.projectId)
        : villas;
  let previewVilla: (typeof villas)[number] | null = null;
  if (set.status === "active") {
    for (const v of coveredVillas.slice(0, 4)) {
      const applicable = await getApplicablePricingRuleSet(v.id, organizationId).catch(() => null);
      if (applicable?.id === set.id) {
        previewVilla = v;
        break;
      }
    }
  }

  /* ---- flatten every rule family into one ordered stack (mock §03) ---- */
  const stack: RuleStackRow[] = [];
  for (const r of rules.dayOfWeek)
    stack.push({
      ruleType: "day_of_week",
      id: r.id,
      status: r.status,
      kind: "day",
      cond: weekdayLabel(r.weekday),
      window: r.minLos != null ? `min LOS ${r.minLos}` : "every week",
      delta: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
    });
  for (const r of rules.occupancy)
    stack.push({
      ruleType: "occupancy",
      id: r.id,
      status: r.status,
      kind: "occupancy",
      cond: `${pct(r.occupancyMin)} – ${pct(r.occupancyMax)} forward occupancy`,
      window: "whenever condition true",
      delta: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
    });
  for (const r of rules.closeOut)
    stack.push({
      ruleType: "close_out",
      id: r.id,
      status: r.status,
      kind: r.modifierType === "stop_sell" ? "close-out" : "lead time",
      kindClass: r.modifierType === "stop_sell" ? "rr-kind-floor" : undefined,
      cond: `${r.daysBeforeCheckinMin}–${r.daysBeforeCheckinMax} days before check-in`,
      window: r.minLos != null ? `min LOS ${r.minLos}` : "rolling window",
      delta:
        r.modifierType === "stop_sell"
          ? "stop-sell"
          : formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
    });
  for (const r of rules.channels)
    stack.push({
      ruleType: "channel",
      id: r.id,
      status: r.status,
      kind: "channel",
      cond: r.channelKey,
      window: r.commissionModel ?? "channel rate",
      delta: formatModifier(r.modifierType, r.modifierValueNumeric, r.modifierAmountMinor),
    });
  for (const r of rules.minStay)
    stack.push({
      ruleType: "min_stay",
      id: r.id,
      status: r.status,
      kind: "min-stay",
      cond: r.name,
      window:
        ([r.startsOn, r.endsOn].filter(Boolean).join(" → ") || "always") +
        (r.weekdayMask?.length ? ` · weekdays ${r.weekdayMask.join(",")}` : "") +
        ` · P${r.priority}`,
      delta: `min ${r.minLos}n`,
    });
  for (const r of rules.stopSell)
    stack.push({
      ruleType: "stop_sell",
      id: r.id,
      status: r.status,
      kind: "stop-sell",
      kindClass: "rr-kind-floor",
      cond: r.name,
      window: `${r.startsOn} → ${r.endsOn}${r.channelKey ? ` · ${r.channelKey}` : " · all channels"}`,
      delta: r.reason.replace(/_/g, " "),
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
            {set.scopeType} · priority {set.priority} · {set.ruleSetCode} · base{" "}
            {formatMoney(set.baseRateMinor)} {cur}
          </p>
        </div>
        <div className="actions">
          <HandoffBadge
            tone={set.status === "active" ? "ok" : set.status === "paused" ? "warn" : "soft"}
          >
            {set.status}
          </HandoffBadge>
          {previewVilla && (
            <Link
              href={`/dashboard/pricing?villa=${previewVilla.id}`}
              className="btn btn-secondary btn-sm"
            >
              Preview curve · {previewVilla.unitCode}
            </Link>
          )}
          <RuleSetLifecycle id={set.id} status={set.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Rule stack — every family, in engine application order */}
        <div>
          <div className="label text-[9.5px] mb-2.5">
            Rules · {stack.length} · order matters (top wins)
          </div>
          {stack.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-soft bg-cream-warm/40 px-5 py-6 text-sm text-ink-3">
              No rules configured — base rate applies. Add the first rule with the editor on
              the right.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stack.map((d, i) => (
                <div
                  key={`${d.ruleType}-${d.id}`}
                  className={`rule-row${d.status !== "active" ? " is-disabled" : ""}${d.pinned ? " is-pinned" : ""}`}
                >
                  <span className="rr-prio">#{i + 1}</span>
                  <span className={`rr-kind${d.kindClass ? ` ${d.kindClass}` : ""}`}>{d.kind}</span>
                  <span className="rr-cond">{d.cond}</span>
                  <span className="rr-effect">{d.window}</span>
                  <span className="rr-delta">{d.delta}</span>
                  <span className="rr-actions">
                    <HandoffBadge tone={d.status === "active" ? "ok" : "soft"}>
                      {d.status}
                    </HandoffBadge>
                    {d.status === "active" && (
                      <ArchiveRuleButton ruleType={d.ruleType} id={d.id} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="font-mono text-[10.5px] text-ink-4 mt-3 mb-0">
            No per-rule enable/disable toggle exists in the backend — archive is one-way;
            re-add a rule via the editor to replace it.
          </p>
        </div>

        {/* Side editor + settings (mock §03 right rail) */}
        <div className="flex flex-col gap-4">
          <AddRuleEditor ruleSetId={set.id} />

          <div className="card card-pad">
            <div className="label text-[9.5px] mb-3.5">Rule set · settings</div>
            <RuleSetSettingsForm
              id={set.id}
              name={set.name}
              priority={set.priority}
              currency={set.currency}
              baseRateMinor={set.baseRateMinor.toString()}
            />
          </div>

          <div className="card card-pad">
            <div className="label text-[9.5px] mb-3.5">Scope / clamps · current</div>
            <dl className="flex flex-col gap-3 m-0">
              <Field label="Scope" value={set.scopeType} />
              <Field
                label="Covers"
                value={
                  set.scopeType === "villa"
                    ? coveredVillas[0]?.unitCode ?? "1 villa"
                    : `${coveredVillas.length} villa${coveredVillas.length === 1 ? "" : "s"}`
                }
              />
              <Field label="Project" value={set.projectId ?? "—"} />
              <Field label="Villa" value={set.villaId ?? "—"} />
              <Field
                label="Min clamp"
                value={set.minRateMinor != null ? `${formatMoney(set.minRateMinor)} ${cur}` : "—"}
              />
              <Field
                label="Max clamp"
                value={set.maxRateMinor != null ? `${formatMoney(set.maxRateMinor)} ${cur}` : "—"}
              />
            </dl>
          </div>
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
