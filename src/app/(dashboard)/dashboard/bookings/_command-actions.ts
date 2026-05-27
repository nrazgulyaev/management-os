import type { CommandAction } from "@/features/command-palette/types";

/**
 * Phase 2.1 PR 3 — Bookings list page command-palette actions.
 *
 * Loaded dynamically by `getCommandSources` when the user opens ⌘K
 * on `/dashboard/bookings/*`. Each action runs against the
 * `CommandActionContext` (router + pathname + close()). Real
 * cabinet actions wire here as 2.2 cabinets land.
 */
export const commandActions: CommandAction[] = [
  {
    id: "new-booking",
    label: "New booking",
    kbd: "⌘N",
    meta: "Direct booking · skips channel sync",
    run: ({ router }) => {
      router.push("/dashboard/bookings/new");
    },
  },
  {
    id: "export-bookings",
    label: "Export current view",
    kbd: "⌘E",
    meta: "CSV · respects active filters",
    run: () => {
      // PR 3 proof-of-life — wired to a download endpoint in 2.2.
      // Today the export button is disabled on the page itself.
      if (typeof window !== "undefined") {
        window.alert("Export wires to /api/bookings/export.csv in Phase 2.2");
      }
    },
  },
];
