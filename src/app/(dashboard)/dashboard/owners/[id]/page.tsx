import { notFound } from "next/navigation";
import Link from "next/link";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { getOwnerById, listOwnershipShares } from "@/features/owners/services";
import { listAccessGrantsForOwner } from "@/features/access-grants/services";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";

export const metadata = { title: "Owner" };
export const dynamic = "force-dynamic";

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getOwnerById(id);
  if (!owner) notFound();
  const allShares = await listOwnershipShares();
  const shares = allShares.filter((s) => s.ownerId === id);
  const grants = await listAccessGrantsForOwner(id);
  const activeGrants = grants.filter((g) => g.status === "active");

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow={`Portfolio · owners · ${owner.type.replace("_", " ")}`}
        title={owner.displayName}
        subtitle={owner.legalName ?? undefined}
      />

      <Card style={{ padding: 20 }}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <SourceBadge source={owner.source} />
          <Badge tone={owner.status === "active" ? "success" : "neutral"}>
            {owner.status}
          </Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <SummaryCell label="Email" value={owner.email ?? "—"} />
          <SummaryCell label="Phone" value={owner.phone ?? "—"} />
          <SummaryCell label="Tax residency" value={owner.taxResidency ?? "—"} />
          <SummaryCell
            label="Active shares"
            value={shares.length.toString()}
            hint={`${activeGrants.length} portal grant${activeGrants.length === 1 ? "" : "s"}`}
          />
        </div>
      </Card>

      <section>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div className="label">Owner-portal access</div>
            <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
              Who can read this owner&apos;s data
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
              Explicit grants replace the v3 email-match heuristic.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/owners/${owner.id}/access`}>
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
              Manage access
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </Button>
        </div>
        <div className="rounded-md border border-line-soft bg-surface p-5">
          {activeGrants.length === 0 ? (
            <div className="text-sm text-ink-tertiary">
              No active grants. Owner cannot see statements through the portal yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeGrants.map((g) => (
                <li key={g.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">
                    {g.appUserName}{" "}
                    <span className="text-ink-tertiary">· {g.appUserEmail}</span>
                  </span>
                  <Badge tone="outline">{g.grantType}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="label">Holdings</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
          Ownership shares
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
          Active and historical participation across villas and pools.
        </p>
        <Table>
          <THead>
            <TR>
              <TH>Subject</TH>
              <TH>Model</TH>
              <TH>Effective</TH>
              <TH>Status</TH>
              <TH className="text-right">Share %</TH>
            </TR>
          </THead>
          <TBody>
            {shares.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                  No shares recorded.
                </TD>
              </TR>
            ) : (
              shares.map((s) => (
                <TR key={s.id}>
                  <TD className="text-ink">
                    {s.villaCode ? `Villa · ${s.villaCode}` : `Project · ${s.projectName}`}
                  </TD>
                  <TD>
                    <Badge tone="outline">{s.model}</Badge>
                  </TD>
                  <TD className="text-ink-secondary text-sm">
                    {s.startsOn}
                    {s.endsOn ? ` → ${s.endsOn}` : " → present"}
                  </TD>
                  <TD>
                    <Badge tone={s.status === "active" ? "success" : "neutral"}>
                      {s.status}
                    </Badge>
                  </TD>
                  <TDNum>{s.sharePercent.toFixed(2)}%</TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-base text-ink mt-1">{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary mt-0.5">{hint}</div>}
    </div>
  );
}

