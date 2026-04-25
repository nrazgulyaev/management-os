import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { getOwnerById, listOwnershipShares } from "@/features/owners/services";
import { Section } from "@/components/ui/section";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";

export const metadata = { title: "Owner" };

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

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owners", href: "/dashboard/owners" },
          { label: owner.displayName },
        ]}
        eyebrow={owner.type.replace("_", " ")}
        title={owner.displayName}
        description={owner.legalName ?? undefined}
        actions={<SourceBadge source={owner.source} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Status"
          value={
            <Badge tone={owner.status === "active" ? "success" : "neutral"}>
              {owner.status}
            </Badge>
          }
        />
        <Stat label="Email" value={<span className="text-sm">{owner.email ?? "—"}</span>} />
        <Stat label="Phone" value={<span className="text-sm">{owner.phone ?? "—"}</span>} />
        <Stat label="Tax residency" value={<span className="text-sm">{owner.taxResidency ?? "—"}</span>} />
      </div>

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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-label">{label}</div>
      <div className="mt-1.5 text-ink">{value}</div>
    </div>
  );
}
