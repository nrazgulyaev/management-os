"use client";

/**
 * design-live gap plan · P1 — "+ Campaign" trigger for the marketing
 * summary cabinet. Renders the prototype `btn btn-amber btn-sm` CTA (to
 * match the surrounding SectionHeading actions) and opens the canonical
 * <Modal> (template 06) over the existing `createCampaign` server action.
 * Budget is entered in major units and converted to minor for storage.
 * Mirrors the campaigns sub-page create form, using the design-system
 * form + modal primitives (no inline styles).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { createCampaign } from "@/lib/development/server/campaigns/campaign-actions";

const OBJECTIVES = [
  "awareness",
  "consideration",
  "conversion",
  "lead_generation",
  "retention",
];

export function NewCampaignButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const budgetMajor = Number(fd.get("budget") ?? 0);
    const channels = (fd.get("primaryChannels") ?? "")
      .toString()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    start(async () => {
      const r = await createCampaign({
        campaignCode: (fd.get("campaignCode") ?? "").toString().trim(),
        name: (fd.get("name") ?? "").toString().trim(),
        campaignObjective: (fd.get("campaignObjective") ?? "").toString(),
        campaignStart: (fd.get("campaignStart") ?? "").toString(),
        campaignEnd: (fd.get("campaignEnd") ?? "").toString(),
        totalBudgetMinor: Math.round(
          (Number.isFinite(budgetMajor) ? budgetMajor : 0) * 100,
        ),
        currency: (fd.get("currency") ?? "IDR").toString(),
        primaryChannels: channels,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not create campaign.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-amber btn-sm"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
      >
        + Campaign
      </button>

      <Modal open={open} onOpenChange={setOpen} size="md" ariaLabel="New campaign">
        <ModalHeader
          glyphTone="accent"
          glyph={<span className="font-mono text-[15px]">＋</span>}
          title="New campaign"
          description="Launch a campaign over the existing spend + lead pipeline."
          onClose={() => !pending && setOpen(false)}
        />
        <form onSubmit={submit}>
          <ModalBody>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Code</span>
                <input
                  name="campaignCode"
                  required
                  minLength={2}
                  className="input"
                  placeholder="SUMMER25"
                />
              </label>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  className="input"
                  placeholder="Summer 2025 push"
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Objective</span>
                <select
                  name="campaignObjective"
                  required
                  defaultValue="awareness"
                  className="select"
                >
                  {OBJECTIVES.map((o) => (
                    <option key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Currency</span>
                <input name="currency" defaultValue="IDR" className="input" />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Start</span>
                <input
                  type="date"
                  name="campaignStart"
                  required
                  className="input"
                />
              </label>
              <label className="field">
                <span className="field-label">End</span>
                <input
                  type="date"
                  name="campaignEnd"
                  required
                  className="input"
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Budget (major units)</span>
                <input
                  type="number"
                  name="budget"
                  min={0}
                  step="any"
                  defaultValue={0}
                  className="input"
                />
              </label>
              <label className="field">
                <span className="field-label">Channels (comma-sep)</span>
                <input
                  name="primaryChannels"
                  className="input"
                  placeholder="meta, google"
                />
              </label>
            </div>

            {err && (
              <div className="rounded-[10px] border border-danger bg-danger-weak text-danger px-3 py-2 text-[13px]">
                {err}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              className="btn btn-dark btn-sm"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-amber btn-sm"
              disabled={pending}
            >
              {pending ? "Creating…" : "Create campaign"}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
