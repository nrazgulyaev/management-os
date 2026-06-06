"use client";

import { useActionState } from "react";
import {
  archiveChannelAction,
  unarchiveChannelAction,
} from "@/features/channels/actions";
import { ChannelModalButton, type ChannelData } from "./_channel-modal";

const btn =
  "text-xs text-ink-secondary px-2 py-1 border border-line-soft rounded transition-colors disabled:opacity-50";

export function ChannelRowActions({ channel }: { channel: ChannelData }) {
  const [, archive, archiving] = useActionState(archiveChannelAction, null);
  const [, unarchive, unarchiving] = useActionState(unarchiveChannelAction, null);
  const archived = channel.status === "archived";

  return (
    <div className="flex items-center justify-end gap-2">
      <ChannelModalButton
        mode="edit"
        channel={channel}
        triggerClassName={`${btn} hover:text-terra`}
        triggerLabel="Edit"
      />
      {archived ? (
        <form action={unarchive}>
          <input type="hidden" name="id" value={channel.id} />
          <button type="submit" disabled={unarchiving} className={`${btn} hover:text-ink`}>
            {unarchiving ? "…" : "Unarchive"}
          </button>
        </form>
      ) : (
        <form action={archive}>
          <input type="hidden" name="id" value={channel.id} />
          <button type="submit" disabled={archiving} className={`${btn} hover:text-danger`}>
            {archiving ? "…" : "Archive"}
          </button>
        </form>
      )}
    </div>
  );
}
