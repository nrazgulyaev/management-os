import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { TurnoverBoard, type TurnoverCard } from "@/components/operations/turnover-board";

/**
 * Phase 2.2 mgmt-04 — Full housekeeping turnover board.
 *
 * Standalone full-page kanban (4 columns). The compact variant
 * lives inside the operations command center; this page is for
 * the housekeeping manager running the day.
 *
 * Real reads against `turnovers` + cleaner roster land in the data
 * PR; today the board renders ~12 mock cards across all 4 columns.
 */

export const metadata: Metadata = { title: "Turnovers · Operations" };
export const dynamic = "force-dynamic";

const MOCK_TURNOVERS: TurnoverCard[] = [
  { id: "t1", villaCode: "EV-07", guestCheckOut: "10:30", guestCheckIn: "14:00", status: "in-progress", assignee: { id: "s1", name: "Wayan" } },
  { id: "t2", villaCode: "AH-04", guestCheckOut: "11:00", guestCheckIn: "15:00", status: "todo", assignee: null, badge: "Late" },
  { id: "t3", villaCode: "EN-02", guestCheckOut: "11:30", status: "todo", assignee: { id: "s2", name: "Made" } },
  { id: "t4", villaCode: "EV-12", guestCheckOut: "09:00", guestCheckIn: "13:00", status: "done", assignee: { id: "s3", name: "Putu" } },
  { id: "t5", villaCode: "EN-05", guestCheckOut: "10:00", guestCheckIn: "14:30", status: "inspection", assignee: { id: "s4", name: "Ketut" }, badge: "Deep clean" },
  { id: "t6", villaCode: "AH-01", guestCheckOut: "12:00", status: "todo", assignee: null },
  { id: "t7", villaCode: "EV-03", guestCheckOut: "08:00", guestCheckIn: "13:00", status: "done", assignee: { id: "s5", name: "Nyoman" } },
  { id: "t8", villaCode: "EN-09", guestCheckOut: "12:30", guestCheckIn: "16:00", status: "in-progress", assignee: { id: "s2", name: "Made" } },
  { id: "t9", villaCode: "AH-02", guestCheckOut: "11:00", guestCheckIn: "15:30", status: "inspection", assignee: { id: "s3", name: "Putu" } },
];

export default async function TurnoversPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Turnovers" },
        ]}
        eyebrow={`${MOCK_TURNOVERS.length} turnovers · today`}
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
      <TurnoverBoard turnovers={MOCK_TURNOVERS} />
    </div>
  );
}
