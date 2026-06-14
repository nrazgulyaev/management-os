import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <span>Turnovers</span>
          </div>
          <h1>Turnovers</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {cards.length} turnover{cards.length === 1 ? "" : "s"} · today. Drag
            cards between columns as cleaners progress. The turnover-allocator
            agent fills empty assignees every 90 seconds during the 10:00–14:00
            window.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/operations"
            className="btn btn-secondary btn-sm inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Operations
          </Link>
        </div>
      </div>
      <TurnoverBoardClient turnovers={cards} />
    </div>
  );
}
