import * as React from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Block 08 — guided first-run zero-state for a freshly-created org.
 *
 * A brand-new workspace (no villas / projects / team beyond the founder)
 * should not present broken or blank cabinet pages. Instead it points the
 * operator at the setup wizard. Uses block 01's `<EmptyState variant=
 * "first-run">` so the look matches every other empty surface.
 *
 * Render it from a cabinet page when its primary query comes back empty
 * AND the org is in the "empty system" state (see `isEmptySystem`).
 */
export function CabinetZeroState({
  cabinet,
  body,
  primaryHref,
  primaryLabel,
}: {
  /** Human cabinet label, e.g. "Bookings". */
  cabinet: string;
  /** Optional override body copy. */
  body?: React.ReactNode;
  /** Optional cabinet-specific "create first thing" CTA (in addition to setup). */
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <EmptyState
      variant="first-run"
      title={`${cabinet} is ready when your workspace is`}
      body={
        body ??
        "Your workspace doesn't have any villas, projects or team yet. Run the guided setup to add them — this cabinet fills in automatically once there's data."
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="primary">
            <Link href="/dashboard/setup">Run guided setup</Link>
          </Button>
          {primaryHref && primaryLabel && (
            <Button asChild variant="secondary">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
          )}
        </div>
      }
    />
  );
}

/**
 * Heuristic: is this org a brand-new, effectively-empty workspace?
 * Mirrors the setup wizard's completion criteria (villas + projects +
 * a team beyond the single founder). Drives whether a cabinet shows the
 * guided zero-state vs an ordinary "no rows yet" empty.
 */
export function isEmptySystem(counts: {
  villas: number;
  projects: number;
  teamMembers: number;
}): boolean {
  return counts.villas === 0 && counts.projects === 0 && counts.teamMembers <= 1;
}
