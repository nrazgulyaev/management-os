/**
 * Stage 6.P4.B — GA4 Reporting API → AttributionTouchpointRecord
 * projection.
 *
 * Pure helpers — no I/O. Take a `runReport` response and project it
 * into the cross-provider domain types so the attribution engine
 * (P4.F) can consume GA4 data alongside Meta Pixel + ad-platform
 * pulls.
 *
 * GA4's Reporting API returns rows like:
 *   {
 *     dimensionHeaders: [{ name: "sessionSource" }, ...],
 *     metricHeaders:    [{ name: "sessions", type: "TYPE_INTEGER" }, ...],
 *     rows: [{ dimensionValues: [{ value: "google" }], metricValues: [{ value: "120" }] }]
 *   }
 *
 * We treat each row as an aggregated touchpoint summary keyed by
 * (source, medium, channelGroup, date) — not a per-visitor touchpoint
 * (the Reporting API is aggregate; per-visitor data needs the Data
 * API export → BigQuery, out of P4 scope).
 */

import type {
  AttributionTouchpointRecord,
  TouchpointChannel,
} from "../../types";

interface GA4Row {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}

interface GA4ReportResponse {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type?: string }>;
  rows?: GA4Row[];
  rowCount?: number;
}

/**
 * Parse a `runReport` body into a header-indexed lookup so callers
 * can grab values by dimension name.
 */
export function projectRunReport(body: string): {
  dimensions: string[];
  metrics: string[];
  rows: Array<Record<string, string>>;
} {
  let parsed: GA4ReportResponse;
  try {
    parsed = JSON.parse(body) as GA4ReportResponse;
  } catch {
    return { dimensions: [], metrics: [], rows: [] };
  }
  const dimensions = (parsed.dimensionHeaders ?? []).map((h) => h.name);
  const metrics = (parsed.metricHeaders ?? []).map((h) => h.name);
  const rows: Array<Record<string, string>> = [];
  for (const r of parsed.rows ?? []) {
    const row: Record<string, string> = {};
    (r.dimensionValues ?? []).forEach((v, i) => {
      const name = dimensions[i];
      if (name) row[name] = v.value;
    });
    (r.metricValues ?? []).forEach((v, i) => {
      const name = metrics[i];
      if (name) row[name] = v.value;
    });
    rows.push(row);
  }
  return { dimensions, metrics, rows };
}

/**
 * Project a `getTrafficSources` response into normalized touchpoint
 * records. Each row carries:
 *   sessionSource, sessionMedium, sessionDefaultChannelGroup,
 *   sessions, activeUsers, conversions
 *
 * GA4 doesn't expose per-visitor session_id via the Reporting API,
 * so the projected records are aggregate summaries — one per
 * (source, medium, channelGroup) tuple. Each is timestamped with
 * the dateRange's startDate.
 */
export function projectTrafficSources(
  body: string,
  startDate: Date,
): AttributionTouchpointRecord[] {
  const { rows } = projectRunReport(body);
  const out: AttributionTouchpointRecord[] = [];
  for (const row of rows) {
    const source = row["sessionSource"];
    const medium = row["sessionMedium"];
    if (!source && !medium) continue;
    const channel = mapChannelGroupToChannel(
      row["sessionDefaultChannelGroup"] ?? "",
    );
    out.push({
      touchpointAt: startDate,
      channel,
      source,
      medium,
      rawPayload: row,
    });
  }
  return out;
}

/**
 * Map GA4's "Default channel grouping" to our `TouchpointChannel`
 * enum. GA4 uses descriptive labels like "Organic Search" / "Direct";
 * we normalize to the snake_case schema enum.
 */
export function mapChannelGroupToChannel(
  channelGroup: string,
): TouchpointChannel {
  const g = channelGroup.toLowerCase();
  if (g.includes("paid") && g.includes("search")) return "paid_search";
  if (g.includes("organic") && g.includes("search")) return "organic_search";
  if (g.includes("paid") && g.includes("social")) return "paid_social";
  if (g.includes("organic") && g.includes("social")) return "organic_social";
  if (g.includes("email")) return "email";
  if (g.includes("display")) return "display";
  if (g.includes("video")) return "video";
  if (g.includes("affiliate")) return "affiliate";
  if (g.includes("referral")) return "referral";
  if (g === "direct" || g === "(direct)") return "direct";
  return "other";
}
