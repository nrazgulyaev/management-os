/**
 * Platform-admin feature-flags cabinet.
 *
 * The `featureFlags` concept (catalog table from migration 0085, lifecycle
 * columns from migration 0129) had no operator UI. This is the index:
 * every flag with its owner + lifecycle bucket (GA / beta / internal /
 * kill / archived) + rollout %, a per-flag kill switch, a rollout bump,
 * and a "+ New flag" form. Gated to super_admin by the (platform-app)
 * layout; every write is audit-logged (action prefix `platform.*`) so it
 * surfaces in /platform/audit.
 *
 * v1 is the index + toggle (the flag×org matrix is a deferred follow-up —
 * see followups in the PR body).
 */

import type { Metadata } from "next";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  FilterPills,
  type FilterPillItem,
} from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listFeatureFlags,
  type FeatureFlagRow,
  type FlagBucket,
} from "@/lib/platform-flags/queries";
import {
  NewFlagButton,
  KillSwitchToggle,
  RolloutControl,
} from "@/components/platform-flags/feature-flag-controls";

export const metadata: Metadata = { title: "Feature flags · Platform Admin OS" };
export const dynamic = "force-dynamic";

const BUCKET_TONE: Record<
  FlagBucket,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  ga: "success",
  beta: "info",
  internal: "neutral",
  kill: "danger",
  archived: "warning",
};

const BUCKET_LABEL: Record<FlagBucket, string> = {
  ga: "GA",
  beta: "Beta",
  internal: "Internal",
  kill: "Killed",
  archived: "Archived",
};

const FILTERS: FlagBucket[] = ["ga", "beta", "internal", "kill", "archived"];

export default async function FeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const sp = await searchParams;
  const bucket = FILTERS.includes(sp.bucket as FlagBucket)
    ? (sp.bucket as FlagBucket)
    : "";

  const allFlags = await safeQuery(
    "platform-flags.list",
    listFeatureFlags(),
    [] as FeatureFlagRow[],
    4000,
  );

  const counts: Record<string, number> = { all: allFlags.length };
  for (const f of FILTERS) {
    counts[f] = allFlags.filter((x) => x.bucket === f).length;
  }

  const flags = bucket
    ? allFlags.filter((f) => f.bucket === bucket)
    : allFlags;

  const baseHref = "/platform/feature-flags";
  const buildHref = (b: string): string =>
    b ? `${baseHref}?bucket=${b}` : baseHref;

  const pills: FilterPillItem[] = [
    { value: "", label: "All", href: buildHref(""), count: counts.all },
    ...FILTERS.map((b) => ({
      value: b,
      label: BUCKET_LABEL[b],
      href: buildHref(b),
      count: counts[b],
    })),
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <div className="flex flex-col gap-[22px]">
        <div className="crumb">Platform Admin OS · Feature flags</div>
        <SectionHeading
          eyebrow={`${allFlags.length} flag${allFlags.length === 1 ? "" : "s"}`}
          title="Feature flags"
          subtitle="Every flag in the catalog with its owner, lifecycle stage, and rollout %. Kill a flag to disable it everywhere, bump rollout to widen exposure, or register a new flag. Every change is audit-logged."
          actions={<NewFlagButton />}
        />
      </div>

      <FilterPills items={pills} current={bucket} label="Stage" />

      <Card padding="none" overflowHidden>
        <div className="pf-card-h">
          <h3>{bucket ? `${BUCKET_LABEL[bucket]} flags` : "All flags"}</h3>
          <span className="meta">CATALOG · {flags.length}</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Flag</TH>
              <TH>Category</TH>
              <TH>Owner</TH>
              <TH>Stage</TH>
              <TH>Rollout</TH>
              <TH className="text-right">Kill switch</TH>
            </TR>
          </THead>
          <TBody>
            {flags.length === 0 ? (
              <TR>
                <TD
                  colSpan={6}
                  className="text-center py-12 text-sm text-ink-tertiary"
                >
                  {allFlags.length === 0
                    ? "No feature flags registered yet. Use “+ New flag” to add one."
                    : "No flags match this stage filter."}
                </TD>
              </TR>
            ) : (
              flags.map((f) => (
                <TR key={f.id}>
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ink font-medium">
                        {f.displayName}
                      </span>
                      <span className="text-xs text-ink-tertiary font-mono">
                        {f.flagCode}
                      </span>
                      {f.description && (
                        <span className="text-xs text-ink-tertiary max-w-md truncate">
                          {f.description}
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone="outline">{f.category}</Badge>
                  </TD>
                  <TD className="text-sm">
                    {f.owner ? (
                      <span className="text-ink-secondary">{f.owner}</span>
                    ) : (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={BUCKET_TONE[f.bucket]}>
                      {BUCKET_LABEL[f.bucket]}
                    </Badge>
                  </TD>
                  <TD>
                    <RolloutControl
                      flagCode={f.flagCode}
                      rolloutPercent={f.rolloutPercent}
                    />
                  </TD>
                  <TD className="text-right">
                    <KillSwitchToggle
                      flagCode={f.flagCode}
                      isActive={f.isActive}
                    />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
