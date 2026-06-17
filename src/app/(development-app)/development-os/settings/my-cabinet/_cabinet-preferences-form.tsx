"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveMyCabinetPreferences } from "./_actions";

/**
 * My Cabinet preferences form (client island).
 *
 * Lets the signed-in user pick their landing cabinet + toggle which
 * dashboard widgets they want visible. Submits through the co-located
 * `saveMyCabinetPreferences` adapter, which derives the userId from the
 * session (never trusts a client-supplied userId — see _actions.ts).
 */

const CABINET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Use role default" },
  { value: "/development-os/dashboard", label: "Executive dashboard" },
  { value: "/development-os/cabinets/marketing-staff", label: "Marketing staff" },
  { value: "/development-os/cabinets/qs", label: "QS analyst" },
  {
    value: "/development-os/cabinets/procurement-manager",
    label: "Procurement manager",
  },
  {
    value: "/development-os/cabinets/warehouse-manager",
    label: "Warehouse manager",
  },
  { value: "/development-os/cabinets/site-supervisor", label: "Site supervisor" },
  { value: "/development-os/cabinets/sales-manager", label: "Sales manager" },
  { value: "/development-os/cabinets/project-manager", label: "Project manager" },
  { value: "/development-os/cabinets/cfo-accountant", label: "CFO / accountant" },
];

const WIDGET_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "kpis", label: "KPI summary cards" },
  { key: "ai_insights", label: "AI insight band" },
  { key: "recent_activity", label: "Recent activity feed" },
  { key: "tasks", label: "My tasks / approvals" },
  { key: "charts", label: "Trend charts" },
];

export function CabinetPreferencesForm({
  initialDefaultCabinetKey,
  initialWidgetPreferences,
  roleDefaultLabel,
}: {
  initialDefaultCabinetKey: string | null;
  initialWidgetPreferences: Record<string, unknown>;
  roleDefaultLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [defaultCabinet, setDefaultCabinet] = useState(
    initialDefaultCabinetKey ?? "",
  );
  const [widgets, setWidgets] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const w of WIDGET_OPTIONS) {
      const v = initialWidgetPreferences?.[w.key];
      // Default every widget on unless explicitly disabled.
      init[w.key] = v === undefined ? true : Boolean(v);
    }
    return init;
  });

  const toggle = (key: string) =>
    setWidgets((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveMyCabinetPreferences({
        defaultCabinetKey: defaultCabinet === "" ? null : defaultCabinet,
        cabinetWidgetPreferences: widgets,
      });
      if (result.ok) {
        setMessage("Preferences saved.");
      } else {
        setError(result.error ?? "Save failed");
      }
    });
  };

  return (
    <div className="space-y-5">
      <label className="flex flex-col gap-1 max-w-md">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Default cabinet
        </span>
        <select
          value={defaultCabinet}
          onChange={(e) => setDefaultCabinet(e.target.value)}
          className="rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
          data-testid="my-cabinet-default"
        >
          {CABINET_OPTIONS.map((o) => (
            <option key={o.value || "role-default"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-3">
          Role default: <code>{roleDefaultLabel}</code>
        </span>
      </label>

      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Visible widgets
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-w-xl">
          {WIDGET_OPTIONS.map((w) => (
            <label
              key={w.key}
              className="flex items-center gap-2 text-sm rounded-md border border-line-soft px-2 py-1.5 cursor-pointer hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={widgets[w.key] ?? false}
                onChange={() => toggle(w.key)}
                disabled={pending}
                data-testid={`my-cabinet-widget-${w.key}`}
              />
              <span>{w.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={save}
          data-testid="my-cabinet-save"
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Save preferences
        </Button>
        {message && <span className="text-xs text-success">{message}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
