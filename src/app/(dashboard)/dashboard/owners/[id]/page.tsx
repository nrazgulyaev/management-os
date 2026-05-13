import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailPageHero } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { getOwnerById, listOwnershipShares } from "@/features/owners/services";
import { listAccessGrantsForOwner } from "@/features/access-grants/services";
import { Section } from "@/components/ui/section";
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
      <DetailPageHero
        breadcrumbs={[
          { label: "Owners", href: "/dashboard/owners" },
          { label: owner.displayName },
        ]}
        eyebrow={owner.type.replace("_", " ")}
        title={owner.displayName}
        description={owner.legalName ?? undefined}
        statusRow={
          <>
            <SourceBadge source={owner.source} />
            <Badge tone={owner.status === "active" ? "success" : "neutral"}>
              {owner.status}
            </Badge>
          </>
        }
        summaryStrip={[
          { label: "Email", value: owner.email ?? "—" },
          { label: "Phone", value: owner.phone ?? "—" },
          { label: "Tax residency", value: owner.taxResidency ?? "—" },
          {
            label: "Active shares",
            value: shares.length.toString(),
            hint: `${activeGrants.length} portal grant${activeGrants.length === 1 ? "" : "s"}`,
          },
        ]}
      />

      <Section
        eyebrow="Owner-portal access"
        title="Who can read this owner's data"
        description="Explicit grants replace the v3 email-match heuristic."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/owners/${owner.id}/access`}>
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
              Manage access
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </Button>
        }
      >
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
      </Section>

      <Section
        eyebrow="Holdings"
        title="Ownership shares"
        description="Active and historical participation across villas and pools."
      >
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
      </Section>
    </div>
  );
}

