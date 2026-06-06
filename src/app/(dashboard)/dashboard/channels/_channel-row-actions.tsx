"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  archiveChannelAction,
  unarchiveChannelAction,
} from "@/features/channels/actions";

const btn =
  "text-xs text-ink-secondary px-2 py-1 border border-line-soft rounded transition-colors disabled:opacity-50";

export function ChannelRowActions({ id, status }: { id: string; status: string }) {
  const [, archive, archiving] = useActionState(archiveChannelAction, null);
  const [, unarchive, unarchiving] = useActionState(unarchiveChannelAction, null);
  const archived = status === "archived";

  return (
    <div className="flex items-center justify-end gap-2">
      <Link href={`/dashboard/channels/${id}/edit`} className={`${btn} hover:text-terra`}>
        Edit
      </Link>
      {archived ? (
        <form action={unarchive}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={unarchiving} className={`${btn} hover:text-ink`}>
            {unarchiving ? "…" : "Unarchive"}
          </button>
        </form>
      ) : (
        <form action={archive}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={archiving} className={`${btn} hover:text-danger`}>
            {archiving ? "…" : "Archive"}
          </button>
        </form>
      )}
    </div>
  );
}
