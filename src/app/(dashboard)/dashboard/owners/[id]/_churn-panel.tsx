"use client";

/**
 * Owner-CHURN drill-in (client). Renders the score breakdown, the
 * signals timeline, the save-plan with intervention buttons, and the
 * insights/intervention feed with Run-analysis — all on top of the
 * existing retention engine. Uses @/components/ui primitives + the
 * cream/stone/ink tokens; never raw bg-black buttons.
 */

import * as React from "react";
import { useActionState } from "react";
import { Card } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RiskPill } from "@/components/owners/risk-pill";
import {
  PhoneCall,
  Gift,
  PlayCircle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  runChurnAnalysisAction,
  scheduleFounderCallAction,
  offerServiceCompAction,
  markInterventionStartedAction,
  resolveInterventionAction,
  type ChurnActionResult,
} from "@/features/owners/churn-actions";
import type { OwnerChurnView } from "@/features/owners/retention-churn-service";
import type { InterventionKind } from "@/features/owners/retention-churn";

const SCORE_TONE: Record<"ok" | "watch" | "flag", string> = {
  ok: "text-success",
  watch: "text-warn",
  flag: "text-danger",
};

const SIGNAL_TONE: Record<"neutral" | "warn" | "danger", string> = {
  neutral: "bg-line-soft",
  warn: "bg-warn",
  danger: "bg-danger",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Generic form-action button bound to a churn action. */
function ActionButton({
  action,
  ownerId,
  label,
  icon,
  variant = "secondary",
}: {
  action: (
    prev: ChurnActionResult | null,
    fd: FormData,
  ) => Promise<ChurnActionResult>;
  ownerId: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "accent";
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  return (
    <form action={dispatch} className="inline-flex flex-col gap-1">
      <input type="hidden" name="ownerId" value={ownerId} />
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {icon}
        {pending ? "Working…" : label}
      </Button>
      {state?.ok && <span className="text-[11px] text-success">{state.message}</span>}
      {state && !state.ok && (
        <span className="text-[11px] text-danger">{state.error}</span>
      )}
    </form>
  );
}

const INTERVENTION_ACTION: Record<
  InterventionKind,
  {
    action: (
      prev: ChurnActionResult | null,
      fd: FormData,
    ) => Promise<ChurnActionResult>;
    label: string;
    icon: React.ReactNode;
  }
> = {
  founder_call: {
    action: scheduleFounderCallAction,
    label: "Schedule founder call",
    icon: <PhoneCall className="w-3.5 h-3.5" strokeWidth={1.75} />,
  },
  service_comp: {
    action: offerServiceCompAction,
    label: "Offer service comp",
    icon: <Gift className="w-3.5 h-3.5" strokeWidth={1.75} />,
  },
  intervention_started: {
    action: markInterventionStartedAction,
    label: "Mark intervention started",
    icon: <PlayCircle className="w-3.5 h-3.5" strokeWidth={1.75} />,
  },
};

function ResolveButton({
  ownerId,
  interventionId,
}: {
  ownerId: string;
  interventionId: string;
}) {
  const [state, dispatch, pending] = useActionState(resolveInterventionAction, null);
  return (
    <form action={dispatch}>
      <input type="hidden" name="ownerId" value={ownerId} />
      <input type="hidden" name="interventionId" value={interventionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        {pending ? "Resolving…" : "Resolve"}
      </Button>
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function OwnerChurnPanel({
  ownerId,
  view,
}: {
  ownerId: string;
  view: OwnerChurnView;
}) {
  const { breakdown, savePlan, signals, feed } = view;

  return (
    <div className="flex flex-col gap-8 px-7 py-6">
      {/* Score breakdown */}
      <Card style={{ padding: 24 }}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="flex flex-col items-center justify-center">
              <span className={`text-[44px] leading-none font-semibold ${SCORE_TONE[breakdown.band]}`}>
                {breakdown.score}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-ink-tertiary mt-1">
                / 100
              </span>
            </div>
            <div className="max-w-md">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  Churn score
                </span>
                <RiskPill level={breakdown.band} />
              </div>
              <p className="text-sm text-ink-secondary">{breakdown.summary}</p>
            </div>
          </div>
          <ActionButton
            action={runChurnAnalysisAction}
            ownerId={ownerId}
            label="Run analysis"
            variant="primary"
            icon={<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />}
          />
        </div>

        {breakdown.contributions.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-3">
            {breakdown.contributions.map((c) => (
              <li key={c.kind} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <RiskPill level={c.level} />
                    <span className="text-sm text-ink">{c.label}</span>
                  </div>
                  <span className="text-sm tabular-nums text-ink-secondary">
                    +{c.points} pts
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-inset overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.level === "flag" ? "bg-danger" : "bg-warn"}`}
                    style={{ width: `${Math.min(100, c.points)}%` }}
                  />
                </div>
                <span className="text-[11px] text-ink-tertiary">{c.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-tertiary">
            No risk signals contributing — this owner looks healthy.
          </p>
        )}
      </Card>

      {/* Save-plan + intervention actions */}
      <section>
        <div className="label mb-1">Save-plan</div>
        <h3 className="display" style={{ fontSize: 20, marginTop: 4, marginBottom: 4, fontWeight: 500 }}>
          Recommended interventions
        </h3>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
          Derived from the dominant churn signals. Each play logs an intervention you can resolve later.
        </p>
        {savePlan.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <p className="text-sm text-ink-tertiary">
              No save-plan needed while churn risk is low. Run an analysis after the next statement to refresh.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {savePlan.map((step, i) => {
              const def = step.intervention ? INTERVENTION_ACTION[step.intervention] : null;
              return (
                <Card key={`${step.intervention ?? "advisory"}-${i}`} style={{ padding: 18 }}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-xl">
                      <div className="text-sm font-medium text-ink">{step.title}</div>
                      <p className="text-[13px] text-ink-secondary mt-1">{step.rationale}</p>
                    </div>
                    {def && (
                      <ActionButton
                        action={def.action}
                        ownerId={ownerId}
                        label={def.label}
                        icon={def.icon}
                        variant={step.intervention === "intervention_started" ? "secondary" : "accent"}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Signals timeline */}
      <section>
        <div className="label mb-1">Signals timeline</div>
        <h3 className="display" style={{ fontSize: 20, marginTop: 4, marginBottom: 4, fontWeight: 500 }}>
          What the engine is reading
        </h3>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
          Recent statements with the metrics that feed the retention engine.
        </p>
        {signals.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <p className="text-sm text-ink-tertiary">No statements yet for this owner.</p>
          </Card>
        ) : (
          <Card style={{ padding: 20 }}>
            <ol className="flex flex-col gap-0">
              {signals.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3 py-2.5">
                  <div className="flex flex-col items-center pt-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${SIGNAL_TONE[s.tone]}`} />
                    {i < signals.length - 1 && (
                      <span className="w-px flex-1 bg-line-soft mt-1" style={{ minHeight: 18 }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink">{s.label}</span>
                      <span className="text-[11px] text-ink-tertiary">{fmtDate(s.when)}</span>
                    </div>
                    <span className="text-[12px] text-ink-secondary">{s.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>

      {/* Insights / interventions feed */}
      <section>
        <div className="label mb-1">Insights feed</div>
        <h3 className="display" style={{ fontSize: 20, marginTop: 4, marginBottom: 4, fontWeight: 500 }}>
          Analyses &amp; interventions
        </h3>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px" }}>
          Every Run-analysis snapshot and logged intervention for this owner.
        </p>
        {feed.length === 0 ? (
          <EmptyState
            variant="caught-up"
            title="No churn activity yet"
            body="Run an analysis to snapshot the score, or log an intervention from the save-plan above."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {feed.map((item) => (
              <Card key={item.id} style={{ padding: 16 }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          item.resolvedAt
                            ? "success"
                            : item.level === "act"
                              ? "danger"
                              : item.level === "watch"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {item.kind === "analysis"
                          ? "Analysis"
                          : item.resolvedAt
                            ? "Resolved"
                            : "Open"}
                      </Badge>
                      <span className="text-sm text-ink">{item.title}</span>
                    </div>
                    {item.detail && (
                      <p className="text-[12px] text-ink-secondary mt-1">{item.detail}</p>
                    )}
                    <span className="text-[11px] text-ink-tertiary mt-1 block">
                      {fmtDate(item.firedAt)}
                      {item.resolvedAt ? ` · resolved ${fmtDate(item.resolvedAt)}` : ""}
                    </span>
                  </div>
                  {item.open && (
                    <ResolveButton ownerId={ownerId} interventionId={item.id} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
