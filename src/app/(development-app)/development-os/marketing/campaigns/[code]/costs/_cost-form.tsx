"use client";

/**
 * dev-marketing gap close — first UI over the existing
 * `recordCampaignCost` server action (zod-validated, org-scoped, bumps
 * campaigns.spent_to_date_minor). Until now the campaign detail's "Log
 * cost entry" button landed on a read-only table; this modal makes the
 * costs surface honest. Mirrors the _campaign-modal pattern (canonical
 * <Modal> + design-system form classes, no inline styles). Cost is
 * entered in major units and converted to minor for storage.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { recordCampaignCost } from "@/lib/development/server/campaigns/campaign-actions";

function optionalCount(fd: FormData, key: string): number | undefined {
  const raw = (fd.get(key) ?? "").toString().trim();
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

export function LogCostButton({
  campaignId,
  defaultCurrency,
  sourceKeys,
}: {
  campaignId: string;
  defaultCurrency: string;
  sourceKeys: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const costMajor = Number(fd.get("cost") ?? 0);
    start(async () => {
      const r = await recordCampaignCost({
        campaignId,
        periodStart: (fd.get("periodStart") ?? "").toString(),
        periodEnd: (fd.get("periodEnd") ?? "").toString(),
        sourceKey: (fd.get("sourceKey") ?? "").toString(),
        costMinor: Math.round(
          (Number.isFinite(costMajor) ? costMajor : 0) * 100,
        ),
        currency: (fd.get("currency") ?? defaultCurrency).toString(),
        dataSource: "manual_entry",
        impressions: optionalCount(fd, "impressions"),
        clicks: optionalCount(fd, "clicks"),
        conversions: optionalCount(fd, "conversions"),
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not record the cost entry.");
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
        + Cost entry
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        size="md"
        ariaLabel="Log cost entry"
      >
        <ModalHeader
          glyphTone="accent"
          glyph={<span className="font-mono text-[15px]">＋</span>}
          title="Log cost entry"
          description="Manual spend entry — bumps the campaign's spent-to-date."
          onClose={() => !pending && setOpen(false)}
        />
        <form onSubmit={submit}>
          <ModalBody>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Period start</span>
                <input
                  type="date"
                  name="periodStart"
                  required
                  className="input"
                />
              </label>
              <label className="field">
                <span className="field-label">Period end</span>
                <input
                  type="date"
                  name="periodEnd"
                  required
                  className="input"
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Lead source</span>
                <select name="sourceKey" required className="select">
                  {sourceKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Currency</span>
                <input
                  name="currency"
                  defaultValue={defaultCurrency}
                  className="input"
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Cost (major units)</span>
                <input
                  type="number"
                  name="cost"
                  min={0}
                  step="any"
                  required
                  className="input"
                />
              </label>
              <label className="field">
                <span className="field-label">Impressions (optional)</span>
                <input
                  type="number"
                  name="impressions"
                  min={0}
                  step={1}
                  className="input"
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Clicks (optional)</span>
                <input
                  type="number"
                  name="clicks"
                  min={0}
                  step={1}
                  className="input"
                />
              </label>
              <label className="field">
                <span className="field-label">Conversions (optional)</span>
                <input
                  type="number"
                  name="conversions"
                  min={0}
                  step={1}
                  className="input"
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
              {pending ? "Recording…" : "Record cost"}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
