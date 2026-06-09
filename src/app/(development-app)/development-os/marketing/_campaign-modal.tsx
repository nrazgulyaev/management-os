"use client";

/**
 * design-live gap plan · P1 — "+ Campaign" trigger for the marketing
 * summary cabinet. Renders the prototype `btn btn-amber btn-sm` CTA (to
 * match the surrounding SectionHeading actions) and opens a compact modal
 * over the existing `createCampaign` server action. Budget is entered in
 * major units and converted to minor for storage. Mirrors the campaigns
 * sub-page create form, restyled to the cabinet's cream/ink tokens.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
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

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            padding: 16,
          }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "var(--panel, var(--paper))",
              border: "1px solid var(--line)",
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <h2
              className="display"
              style={{ fontSize: 20, marginBottom: 14, fontWeight: 500 }}
            >
              New campaign
            </h2>
            <form onSubmit={submit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <Field label="Code">
                  <input
                    name="campaignCode"
                    required
                    minLength={2}
                    style={inputStyle}
                    placeholder="SUMMER25"
                  />
                </Field>
                <Field label="Name">
                  <input
                    name="name"
                    required
                    minLength={2}
                    style={inputStyle}
                    placeholder="Summer 2025 push"
                  />
                </Field>
                <Field label="Objective">
                  <select
                    name="campaignObjective"
                    required
                    defaultValue="awareness"
                    style={inputStyle}
                  >
                    {OBJECTIVES.map((o) => (
                      <option key={o} value={o}>
                        {o.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Currency">
                  <input name="currency" defaultValue="IDR" style={inputStyle} />
                </Field>
                <Field label="Start">
                  <input
                    type="date"
                    name="campaignStart"
                    required
                    style={inputStyle}
                  />
                </Field>
                <Field label="End">
                  <input
                    type="date"
                    name="campaignEnd"
                    required
                    style={inputStyle}
                  />
                </Field>
                <Field label="Budget (major units)">
                  <input
                    type="number"
                    name="budget"
                    min={0}
                    step="any"
                    defaultValue={0}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Channels (comma-sep)">
                  <input
                    name="primaryChannels"
                    style={inputStyle}
                    placeholder="meta, google"
                  />
                </Field>
              </div>

              {err && (
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "rgba(220,80,60,0.08)",
                    color: "var(--coral, #c0392b)",
                    padding: "8px 12px",
                    fontSize: 13,
                  }}
                >
                  {err}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
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
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--bg-2, var(--paper))",
  color: "var(--ink)",
  padding: "7px 10px",
  fontSize: 13,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
        color: "var(--ink-3, var(--ink-tertiary))",
      }}
    >
      {label}
      {children}
    </label>
  );
}
