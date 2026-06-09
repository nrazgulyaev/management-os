"use client";

/**
 * W4 mgmt-04 — TurnoverBoardClient.
 *
 * Thin client wrapper that wires <TurnoverBoard>'s onMove drag event to
 * the updateTurnoverStatusAction server action. <TurnoverBoard> already
 * updates its own state optimistically; this persists the move and shows
 * a non-blocking error banner if the write is rejected.
 *
 * The page (a server component) stays free of client hooks by rendering
 * this wrapper and passing the real reads in.
 */

import * as React from "react";
import {
  TurnoverBoard,
  type TurnoverCard,
  type TurnoverStatus,
} from "./turnover-board";
import { updateTurnoverStatusAction } from "@/features/operations/turnover-actions";

export interface TurnoverBoardClientProps {
  turnovers: TurnoverCard[];
}

export function TurnoverBoardClient({ turnovers }: TurnoverBoardClientProps) {
  const [, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onMove(id: string, status: TurnoverStatus) {
    setError(null);
    startTransition(async () => {
      const res = await updateTurnoverStatusAction({ id, status });
      if (!res.ok) {
        setError(res.error ?? "Could not save that move. Refresh and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <TurnoverBoard turnovers={turnovers} onMove={onMove} />
    </div>
  );
}
