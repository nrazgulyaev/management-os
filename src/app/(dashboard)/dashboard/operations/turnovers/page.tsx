import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { TurnoverBoardClient } from "@/components/operations/turnover-board-client";
import { getTodaysTurnovers, toTurnoverCards } from "@/features/operations/turnover-queries";

/**
 * Phase 2.2 mgmt-04 — Full housekeeping turnover board.
 *
 * Standalone full-page kanban (4 columns). The compact variant
 * lives inside the operations command center; this page is for
 * the housekeeping manager running the day.
 *
 * W4 — real reads against `turnovers` (derived on first read from
 * same-day checkout bookings). Drag-between-columns persists via
 * updateTurnoverStatusAction. The turnover-allocator agent fills empty
 * assignees on its 90s cron during the turnover window.
 */

export const metadata: Metadata = { title: "Turnovers · Operations" };
export const dynamic = "force-dynamic";

export default async function TurnoversPage() {
  const rows = await getTodaysTurnovers();
  const cards = toTurnoverCards(rows);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Turnovers" },
        ]}
        eyebrow={`${cards.length} turnover${cards.length === 1 ? "" : "s"} · today`}
        title="Turnovers"
        description="Drag cards between columns as cleaners progress. The turnover-allocator agent fills empty assignees every 90 seconds during the 10:00–14:00 window."
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/operations">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Operations
            </Link>
          </Button>
        }
      />
      <TurnoverBoardClient turnovers={cards} />
    </div>
  );
}
