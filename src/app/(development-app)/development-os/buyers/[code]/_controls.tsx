"use client";

/**
 * Wire-up sweep — buyer lifecycle + progress report operator controls.
 *
 * All four actions already existed (permission-gated, org-scoped,
 * audit-logged) with no UI caller. This island only mounts the UI; it
 * adds no authority. Follows the dev-os inline-action island convention
 * (see ../../cashflow-forecast/_controls.tsx) + the EntityModal form
 * pattern (see investor-modal-form.tsx).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  assignUnitToBuyerAction,
  updateBuyerKycStatusAction,
  activateBuyerPortalAccessAction,
  createBuyerProgressReportAction,
  transitionBuyerProgressReportAction,
} from "./_actions";

const KYC_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "verified",
  "rejected",
  "expired",
] as const;

const ASSIGNMENT_STATUSES = [
  "reserved",
  "contracted",
  "paying",
  "paid_in_full",
  "handed_over",
  "cancelled",
] as const;

const CONFIDENCE = ["high", "medium", "low"] as const;

type UnitOption = { id: string; label: string };
type ProjectOption = { id: string; name: string };

/* ------------------------------------------------------------------ */
/* 1a. Assign unit                                                     */
/* ------------------------------------------------------------------ */

export function AssignUnitControl({
  buyerId,
  units,
}: {
  buyerId: string;
  units: UnitOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    setError(null);
    const unitId = String(fd.get("unitId") ?? "");
    const status = String(fd.get("status") ?? "reserved");
    const notes = String(fd.get("notes") ?? "").trim();
    if (!unitId) {
      setError("Pick a unit.");
      return;
    }
    start(async () => {
      try {
        const res = await assignUnitToBuyerAction({
          buyerId,
          unitId,
          status,
          notes: notes || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to assign unit");
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        className="btn-sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="buyer-assign-unit-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Assign unit
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Assign unit"
        size="md"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          {units.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              No villas available to assign in this organization.
            </p>
          ) : (
            <>
              <Field label="Unit" required>
                <select
                  name="unitId"
                  required
                  defaultValue=""
                  className={selectCls}
                >
                  <option value="" disabled>
                    Select unit…
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  name="status"
                  defaultValue="reserved"
                  className={selectCls}
                >
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  name="notes"
                  rows={2}
                  className={textareaCls}
                  placeholder="Optional"
                />
              </Field>
            </>
          )}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending || units.length === 0} pendingLabel="Assigning…">
              Assign unit
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1b. KYC status selector                                             */
/* ------------------------------------------------------------------ */

export function KycStatusControl({
  buyerId,
  current,
}: {
  buyerId: string;
  current: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const kycStatus = e.target.value;
    if (kycStatus === current) return;
    setError(null);
    start(async () => {
      try {
        const res = await updateBuyerKycStatusAction({ buyerId, kycStatus });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update KYC");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={current}
        onChange={onChange}
        disabled={pending}
        className={`${selectCls} max-w-[180px]`}
        aria-label="KYC status"
        data-testid="buyer-kyc-select"
      >
        {KYC_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-ink-tertiary">Saving…</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1c. Enable portal access                                            */
/* ------------------------------------------------------------------ */

export function PortalAccessControl({
  buyerId,
  enabled,
}: {
  buyerId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    setError(null);
    const supabaseUserId = String(fd.get("supabaseUserId") ?? "").trim();
    if (!supabaseUserId) {
      setError("Supabase user ID is required.");
      return;
    }
    start(async () => {
      try {
        const res = await activateBuyerPortalAccessAction({
          buyerId,
          supabaseUserId,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to enable portal access",
        );
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        className="btn-sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="buyer-portal-access-trigger"
      >
        {enabled ? "Re-link portal user" : "Enable portal access"}
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Enable portal access"
        description="Links the buyer to a Supabase auth user and turns on portal access."
        size="md"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <Field
            label="Supabase user ID"
            required
            hint="The auth.users UUID for this buyer's portal login."
          >
            <input
              name="supabaseUserId"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className={inputCls}
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Enabling…">
              Enable access
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2a. Create progress report                                          */
/* ------------------------------------------------------------------ */

export function CreateProgressReportControl({
  projects,
  units,
}: {
  projects: ProjectOption[];
  units: UnitOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    setError(null);
    const projectId = String(fd.get("projectId") ?? "");
    const unitId = String(fd.get("unitId") ?? "");
    const reportingPeriodStart = String(fd.get("reportingPeriodStart") ?? "");
    const reportingPeriodEnd = String(fd.get("reportingPeriodEnd") ?? "");
    const pctRaw = String(fd.get("currentProgressPercentage") ?? "").trim();
    const confidence = String(fd.get("budgetProgressConfidence") ?? "");
    const expectedHandoverDate = String(fd.get("expectedHandoverDate") ?? "").trim();
    const worksCompletedSummary = String(fd.get("worksCompletedSummary") ?? "").trim();
    const worksPlannedSummary = String(fd.get("worksPlannedSummary") ?? "").trim();
    const nextMilestone = String(fd.get("nextMilestone") ?? "").trim();
    const highlightedRisks = String(fd.get("highlightedRisks") ?? "").trim();
    const managementCommentary = String(fd.get("managementCommentary") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const internalNotes = String(fd.get("internalNotes") ?? "").trim();

    if (!projectId) {
      setError("Pick a project.");
      return;
    }
    if (!reportingPeriodStart || !reportingPeriodEnd) {
      setError("Reporting period start and end are required.");
      return;
    }

    start(async () => {
      try {
        const res = await createBuyerProgressReportAction({
          projectId,
          unitId: unitId || null,
          reportingPeriodStart,
          reportingPeriodEnd,
          currentProgressPercentage: pctRaw === "" ? null : Number(pctRaw),
          budgetProgressConfidence: confidence || null,
          expectedHandoverDate: expectedHandoverDate || null,
          worksCompletedSummary: worksCompletedSummary || null,
          worksPlannedSummary: worksPlannedSummary || null,
          nextMilestone: nextMilestone || null,
          highlightedRisks: highlightedRisks || null,
          managementCommentary: managementCommentary || null,
          notes: notes || null,
          internalNotes: internalNotes || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create report");
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        className="btn-sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="buyer-report-create-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New progress report
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New progress report (draft)"
        description="Created as a draft. Submit → approve → publish to surface it to buyers."
        size="lg"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Project" required>
              <select name="projectId" required defaultValue="" className={selectCls}>
                <option value="" disabled>
                  Select project…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit" hint="Leave blank for a project-level report.">
              <select name="unitId" defaultValue="" className={selectCls}>
                <option value="">— project-level —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Period start" required>
              <input type="date" name="reportingPeriodStart" required className={inputCls} />
            </Field>
            <Field label="Period end" required>
              <input type="date" name="reportingPeriodEnd" required className={inputCls} />
            </Field>
            <Field label="Progress %" hint="0–100">
              <input
                type="number"
                name="currentProgressPercentage"
                min={0}
                max={100}
                step="0.01"
                className={inputCls}
              />
            </Field>
            <Field label="Budget confidence">
              <select name="budgetProgressConfidence" defaultValue="" className={selectCls}>
                <option value="">— unspecified —</option>
                {CONFIDENCE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected handover date">
              <input type="date" name="expectedHandoverDate" className={inputCls} />
            </Field>
            <Field label="Next milestone">
              <input name="nextMilestone" className={inputCls} placeholder="Optional" />
            </Field>
          </div>
          <Field label="Works completed">
            <textarea name="worksCompletedSummary" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <Field label="Works planned">
            <textarea name="worksPlannedSummary" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <Field label="Highlighted risks">
            <textarea name="highlightedRisks" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <Field label="Management commentary">
            <textarea name="managementCommentary" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <Field label="Notes (buyer-visible)">
            <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <Field label="Internal notes (never shown to buyer)">
            <textarea name="internalNotes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Creating…">
              Create draft
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2b. Per-report transition buttons                                   */
/* ------------------------------------------------------------------ */

/**
 * Valid transitions mirror the server state machine
 * (buyer-progress-actions.ts):
 *   draft            → pending_approval | archived
 *   pending_approval → approved | draft | archived
 *   approved         → published | draft | archived
 *   published        → archived
 *   archived         → (none)
 */
const NEXT: Record<string, { to: string; label: string }[]> = {
  draft: [
    { to: "pending_approval", label: "Submit for approval" },
    { to: "archived", label: "Archive" },
  ],
  pending_approval: [
    { to: "approved", label: "Approve" },
    { to: "draft", label: "Back to draft" },
    { to: "archived", label: "Archive" },
  ],
  approved: [
    { to: "published", label: "Publish" },
    { to: "draft", label: "Back to draft" },
    { to: "archived", label: "Archive" },
  ],
  published: [{ to: "archived", label: "Archive" }],
  archived: [],
};

export function ReportTransitionControls({
  reportId,
  status,
}: {
  reportId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function go(to: string) {
    setError(null);
    start(async () => {
      try {
        const res = await transitionBuyerProgressReportAction({ reportId, to });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transition failed");
      }
    });
  }

  const options = NEXT[status] ?? [];
  if (options.length === 0) {
    return <span className="text-xs text-ink-tertiary">—</span>;
  }

  const btn =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.to}
          type="button"
          className={btn}
          disabled={pending}
          onClick={() => go(o.to)}
        >
          {o.label}
        </button>
      ))}
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}
