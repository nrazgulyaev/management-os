"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MATRIX_CABINETS,
  MATRIX_ROLES,
  roleLabel,
  defaultAccess,
  cellKey,
} from "@/features/keystone/matrix";
import { saveRoleAccessMatrixAction } from "@/features/keystone/actions";
import type { RoleKey } from "@/features/auth/permission-matrix";

/** Cells the page hands us: only those that DIFFER from the code default. */
export type InitialOverride = {
  cabinet: string;
  roleKey: string;
  canAccess: boolean;
};

export function MatrixEditor({
  initialOverrides,
  readOnly,
  viewerRoles = [],
}: {
  initialOverrides: InitialOverride[];
  /** When the viewer lacks roles.assign — render but disable the toggles. */
  readOnly: boolean;
  /**
   * The current user's role(s) that appear as matrix columns — those
   * columns get the accent highlight + a "you" tag (mock: «твоя колонка
   * подсвечена»). Empty for super-admins / demo mode (always all-access,
   * not shown as a column).
   */
  viewerRoles?: RoleKey[];
}) {
  const viewerRoleSet = useMemo(() => new Set<RoleKey>(viewerRoles), [viewerRoles]);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effective state per cell (cabinet::role -> boolean).
  const [state, setState] = useState<Map<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    for (const c of MATRIX_CABINETS) {
      for (const r of MATRIX_ROLES) {
        m.set(cellKey(c.key, r), defaultAccess(c.key, r));
      }
    }
    for (const o of initialOverrides) {
      m.set(cellKey(o.cabinet, o.roleKey as RoleKey), o.canAccess);
    }
    return m;
  });

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const c of MATRIX_CABINETS) {
      for (const r of MATRIX_ROLES) {
        const k = cellKey(c.key, r);
        if (state.get(k) !== defaultAccess(c.key, r)) n++;
      }
    }
    return n;
  }, [state]);

  const toggle = (cabinet: string, role: RoleKey) => {
    if (readOnly) return;
    setSaved(false);
    setState((prev) => {
      const next = new Map(prev);
      const k = cellKey(cabinet, role);
      next.set(k, !next.get(k));
      return next;
    });
  };

  const resetToDefaults = () => {
    if (readOnly) return;
    setSaved(false);
    setState(() => {
      const m = new Map<string, boolean>();
      for (const c of MATRIX_CABINETS) {
        for (const r of MATRIX_ROLES) {
          m.set(cellKey(c.key, r), defaultAccess(c.key, r));
        }
      }
      return m;
    });
  };

  const save = () => {
    setError(null);
    const cells = MATRIX_CABINETS.flatMap((c) =>
      MATRIX_ROLES.map((r) => ({
        cabinet: c.key,
        roleKey: r,
        canAccess: state.get(cellKey(c.key, r)) ?? defaultAccess(c.key, r),
      })),
    );
    startTransition(async () => {
      const res = await saveRoleAccessMatrixAction({ cells });
      if (res.ok) {
        setSaved(true);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          {dirtyCount > 0 ? (
            <Badge tone="warning">{dirtyCount} cell{dirtyCount === 1 ? "" : "s"} differ from default</Badge>
          ) : (
            <Badge tone="neutral">Matches code defaults</Badge>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={resetToDefaults} disabled={pending}>
              <RotateCcw className="h-4 w-4" />
              Reset to defaults
            </Button>
            <Button onClick={save} disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? "Saving…" : "Save matrix"}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-line-soft bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-[11px] uppercase tracking-widest text-ink-tertiary">
                Cabinet
              </th>
              {MATRIX_ROLES.map((r) => {
                const isViewer = viewerRoleSet.has(r);
                return (
                  <th
                    key={r}
                    className={cn(
                      "px-3 py-3 text-center text-[11px] font-medium align-bottom",
                      isViewer ? "bg-accent/10 text-accent" : "text-ink-secondary",
                    )}
                  >
                    {isViewer && (
                      <span className="mb-1.5 inline-block rounded-full bg-accent px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-on-accent">
                        you
                      </span>
                    )}
                    <span className="block whitespace-nowrap [writing-mode:vertical-rl] rotate-180 mx-auto h-24 leading-none">
                      {roleLabel(r)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {MATRIX_CABINETS.map((c) => (
              <tr key={c.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium text-ink whitespace-nowrap"
                >
                  {c.label}
                </th>
                {MATRIX_ROLES.map((r) => {
                  const k = cellKey(c.key, r);
                  const on = state.get(k) ?? false;
                  const def = defaultAccess(c.key, r);
                  const overridden = on !== def;
                  return (
                    <td
                      key={r}
                      className={cn(
                        "px-3 py-2 text-center",
                        viewerRoleSet.has(r) && "bg-accent/5",
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${c.label} · ${roleLabel(r)} · ${on ? "can access" : "no access"}`}
                        disabled={readOnly || pending}
                        onClick={() => toggle(c.key, r)}
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-sm border transition-colors",
                          on
                            ? "border-success/40 bg-success/15 text-success"
                            : "border-line-soft bg-canvas text-transparent hover:bg-muted/40",
                          overridden && "ring-2 ring-warning/50",
                          (readOnly || pending) && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-success/40 bg-success/15 text-success">
            <Check className="h-3 w-3" />
          </span>
          Visible — role sees the cabinet
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-sm border border-line-soft bg-canvas" />
          Hidden — cabinet is gated off
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-sm border border-line-soft bg-canvas ring-2 ring-warning/50" />
          Differs from the built-in default
        </span>
        {viewerRoles.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded-sm bg-accent/10 border border-accent/30" />
            Your role&apos;s column
          </span>
        )}
      </div>

      <p className="text-xs text-ink-tertiary leading-relaxed">
        A checked cell means the role can <strong>see</strong> that cabinet (its
        read access) — the same rule that filters the sidebar and gates each
        cabinet route. Super admin always has full access and is not shown.
        Saving stores only the cells that deviate from the defaults.
      </p>
    </div>
  );
}
