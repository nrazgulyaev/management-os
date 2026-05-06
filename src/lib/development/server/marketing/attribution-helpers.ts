/**
 * Stage 5.E — Marketing attribution pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Five attribution models:
 *   - first_touch:   100% credit to first touchpoint
 *   - last_touch:    100% credit to last touchpoint
 *   - linear:        equal share to all touchpoints
 *   - time_decay:    weight increases as touchpoint approaches conversion (half-life decay)
 *   - position_based: 40% first, 40% last, 20% split across middle (a.k.a. "U-shape")
 */

export type AttributionModel =
  | "first_touch"
  | "last_touch"
  | "linear"
  | "time_decay"
  | "position_based";

export type TouchpointType =
  | "view"
  | "click"
  | "form_submit"
  | "message"
  | "call"
  | "visit";

export interface Touchpoint {
  source: string;
  timestamp: Date;
  type: TouchpointType;
  campaignId?: string;
  utmParams?: Record<string, string>;
}

export interface AttributionInput {
  touchpoints: Touchpoint[];
  conversionTimestamp: Date;
}

export interface AttributedSource {
  source: string;
  weight: number;
  /** 0–1; sum across attributedSources should be 1.0 (modulo float). */
  fraction: number;
}

export interface AttributionOutput {
  attributedSources: AttributedSource[];
  totalWeight: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function sortByTime(t: Touchpoint[]): Touchpoint[] {
  return [...t].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function aggregateBySource(
  weighted: Array<{ source: string; weight: number }>,
): AttributedSource[] {
  const total = weighted.reduce((a, w) => a + w.weight, 0);
  const bySource = new Map<string, number>();
  for (const w of weighted) {
    bySource.set(w.source, (bySource.get(w.source) ?? 0) + w.weight);
  }
  return Array.from(bySource.entries())
    .map(([source, weight]) => ({
      source,
      weight,
      fraction: total > 0 ? weight / total : 0,
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function applyAttributionModel(
  input: AttributionInput,
  model: AttributionModel,
): AttributionOutput {
  if (input.touchpoints.length === 0) {
    return { attributedSources: [], totalWeight: 0 };
  }
  const sorted = sortByTime(input.touchpoints);

  let weighted: Array<{ source: string; weight: number }>;

  switch (model) {
    case "first_touch":
      weighted = [{ source: sorted[0].source, weight: 1 }];
      break;
    case "last_touch":
      weighted = [{ source: sorted[sorted.length - 1].source, weight: 1 }];
      break;
    case "linear": {
      const w = 1 / sorted.length;
      weighted = sorted.map((t) => ({ source: t.source, weight: w }));
      break;
    }
    case "time_decay": {
      // Half-life of 7 days: weight = 0.5 ^ (daysToConversion / 7).
      const halfLifeDays = 7;
      const conv = input.conversionTimestamp.getTime();
      const raw = sorted.map((t) => {
        const daysToConv = (conv - t.timestamp.getTime()) / DAY_MS;
        const w = Math.pow(0.5, Math.max(0, daysToConv) / halfLifeDays);
        return { source: t.source, weight: w };
      });
      const totalRaw = raw.reduce((a, r) => a + r.weight, 0);
      weighted =
        totalRaw > 0
          ? raw.map((r) => ({ source: r.source, weight: r.weight / totalRaw }))
          : raw;
      break;
    }
    case "position_based": {
      if (sorted.length === 1) {
        weighted = [{ source: sorted[0].source, weight: 1 }];
      } else if (sorted.length === 2) {
        weighted = [
          { source: sorted[0].source, weight: 0.5 },
          { source: sorted[1].source, weight: 0.5 },
        ];
      } else {
        const middleCount = sorted.length - 2;
        const middleEach = 0.2 / middleCount;
        weighted = [
          { source: sorted[0].source, weight: 0.4 },
          ...sorted
            .slice(1, -1)
            .map((t) => ({ source: t.source, weight: middleEach })),
          { source: sorted[sorted.length - 1].source, weight: 0.4 },
        ];
      }
      break;
    }
  }

  const attributedSources = aggregateBySource(weighted);
  const totalWeight = attributedSources.reduce((a, s) => a + s.weight, 0);
  return { attributedSources, totalWeight };
}

// ---------------------------------------------------------------------------
// Channel ROI
// ---------------------------------------------------------------------------

export interface ChannelROIInput {
  channelCosts: Map<string, number>;
  channelLeads: Map<string, number>;
  channelConversions: Map<string, number>;
  channelRevenue: Map<string, number>;
}

export interface ChannelROIRow {
  channel: string;
  costMinor: number;
  leads: number;
  conversions: number;
  revenueMinor: number;
  costPerLeadMinor: number;
  costPerConversionMinor: number;
  /** ROI multiple: revenue / cost. Infinity if cost is zero and revenue > 0. */
  roiMultiple: number;
}

export interface ChannelROIOutput {
  perChannel: ChannelROIRow[];
  totalCost: number;
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
}

export function computeChannelROI(input: ChannelROIInput): ChannelROIOutput {
  const channels = new Set<string>([
    ...input.channelCosts.keys(),
    ...input.channelLeads.keys(),
    ...input.channelConversions.keys(),
    ...input.channelRevenue.keys(),
  ]);
  const perChannel: ChannelROIRow[] = Array.from(channels)
    .map((c) => {
      const costMinor = input.channelCosts.get(c) ?? 0;
      const leads = input.channelLeads.get(c) ?? 0;
      const conversions = input.channelConversions.get(c) ?? 0;
      const revenueMinor = input.channelRevenue.get(c) ?? 0;
      const cpl = leads > 0 ? Math.round(costMinor / leads) : 0;
      const cpc =
        conversions > 0 ? Math.round(costMinor / conversions) : 0;
      let roi = 0;
      if (costMinor > 0) roi = revenueMinor / costMinor;
      else if (revenueMinor > 0) roi = Infinity;
      return {
        channel: c,
        costMinor,
        leads,
        conversions,
        revenueMinor,
        costPerLeadMinor: cpl,
        costPerConversionMinor: cpc,
        roiMultiple: roi,
      };
    })
    .sort((a, b) => b.revenueMinor - a.revenueMinor);

  return {
    perChannel,
    totalCost: perChannel.reduce((a, c) => a + c.costMinor, 0),
    totalLeads: perChannel.reduce((a, c) => a + c.leads, 0),
    totalConversions: perChannel.reduce((a, c) => a + c.conversions, 0),
    totalRevenue: perChannel.reduce((a, c) => a + c.revenueMinor, 0),
  };
}
