"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  CHANNEL_LABELS,
  ConnectChannelModal,
} from "./connect-channel-modal";
import type {
  ChannelConnectionStatus,
  ChannelName,
} from "@/lib/db/schema/channel-manager";

/**
 * Stage 6.P1.E.1 — One cell in the villa × channel grid.
 *
 * Renders either a status badge + link to the connection detail page
 * (if connected) or a "Connect" button that opens the credentials
 * modal (if not).
 */

export function ConnectionCard({
  channel,
  villaId,
  villaName,
  connection,
}: {
  channel: ChannelName;
  villaId: string;
  villaName: string;
  connection: {
    id: string;
    status: ChannelConnectionStatus;
    externalPropertyId: string;
    lastInventorySyncAt: Date | null;
  } | null;
}) {
  if (!connection) {
    return (
      <div
        className="rounded-md border border-dashed border-line-soft p-2 text-center"
        data-testid={`channel-cell-${channel}-disconnected`}
      >
        <ConnectChannelModal
          channel={channel}
          villaId={villaId}
          villaName={villaName}
        />
      </div>
    );
  }
  return (
    <Link
      href={`/development-os/channels/${connection.id}`}
      className="block rounded-md border border-line-soft p-2 hover:bg-muted/30"
      data-testid={`channel-cell-${channel}-${connection.status}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink">
          {CHANNEL_LABELS[channel]}
        </span>
        <Badge tone={statusTone(connection.status)}>{connection.status}</Badge>
      </div>
      <div className="text-[11px] text-ink-tertiary mt-1 font-mono truncate">
        {connection.externalPropertyId}
      </div>
      {connection.lastInventorySyncAt && (
        <div className="text-[10px] text-ink-tertiary mt-0.5">
          Last sync:{" "}
          {connection.lastInventorySyncAt.toISOString().slice(0, 16).replace("T", " ")}
        </div>
      )}
    </Link>
  );
}

function statusTone(
  s: ChannelConnectionStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (s) {
    case "active":
      return "success";
    case "paused":
      return "warning";
    case "error":
      return "danger";
    case "connecting":
    case "pending":
      return "info";
    case "archived":
      return "neutral";
  }
}
