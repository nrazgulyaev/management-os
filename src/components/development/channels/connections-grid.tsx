import { ConnectionCard } from "./connection-card";
import { CHANNEL_LABELS } from "./connect-channel-modal";
import type {
  ChannelConnectionStatus,
  ChannelName,
} from "@/lib/db/schema/channel-manager";

/**
 * Stage 6.P1.E.1 — Villa × channel matrix.
 *
 * Server component (no "use client") — pure rendering. Each cell
 * delegates to <ConnectionCard> which handles the per-cell connect
 * flow. Channels with no connection slot render the Connect modal
 * trigger; channels with a connection link to the detail page.
 *
 * Channel order is the consumer-recognition ranking the operator
 * sees in their daily workflow. Direct is intentionally last — it's
 * not a real channel, just a marker for in-platform bookings.
 */

const VISIBLE_CHANNELS: readonly ChannelName[] = [
  "booking_com",
  "airbnb",
  "trip_com",
  "agoda",
  "expedia",
  "vrbo",
  "hotels_com",
] as const;

export interface VillaRow {
  id: string;
  name: string;
  unitCode: string;
}

export interface ConnectionLite {
  id: string;
  villaId: string;
  channel: ChannelName;
  externalPropertyId: string;
  status: ChannelConnectionStatus;
  lastInventorySyncAt: Date | null;
}

export function ConnectionsGrid({
  villas,
  connections,
}: {
  villas: VillaRow[];
  connections: ConnectionLite[];
}) {
  // Index connections by (villaId, channel) for O(1) lookup per cell.
  const byKey = new Map<string, ConnectionLite>();
  for (const c of connections) byKey.set(`${c.villaId}|${c.channel}`, c);

  return (
    <div className="overflow-x-auto" data-testid="connections-grid">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-line-soft">
            <th className="py-2 pr-4 text-[11px] uppercase tracking-wide text-ink-tertiary">
              Villa
            </th>
            {VISIBLE_CHANNELS.map((c) => (
              <th
                key={c}
                className="py-2 pr-2 text-[11px] uppercase tracking-wide text-ink-tertiary"
              >
                {CHANNEL_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {villas.map((v) => (
            <tr key={v.id} className="border-b border-line-soft align-top">
              <td className="py-2 pr-4">
                <div className="font-medium text-sm">{v.name}</div>
                <div className="text-[11px] font-mono text-ink-tertiary">
                  {v.unitCode}
                </div>
              </td>
              {VISIBLE_CHANNELS.map((c) => {
                const conn = byKey.get(`${v.id}|${c}`);
                return (
                  <td key={c} className="py-2 pr-2 min-w-[180px]">
                    <ConnectionCard
                      channel={c}
                      villaId={v.id}
                      villaName={v.name}
                      connection={
                        conn
                          ? {
                              id: conn.id,
                              status: conn.status,
                              externalPropertyId: conn.externalPropertyId,
                              lastInventorySyncAt: conn.lastInventorySyncAt,
                            }
                          : null
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
