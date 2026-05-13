import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listEquivalenceGroups,
  listEquivalenceMembers,
} from "@/features/owner-stays/services";
import { listVillas } from "@/features/villas/services";
import { AddEquivalenceMemberForm } from "@/components/owner-stays/add-member-form";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { AddEquivalenceGroupButton } from "@/components/dashboard/owners/owners-add-buttons";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Equivalence groups" };
export const dynamic = "force-dynamic";

export default async function EquivalenceGroupsPage() {
  const groups = await listEquivalenceGroups();
  const allVillas = await listVillas();
  const groupsWithMembers = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      members: await listEquivalenceMembers(g.id),
    })),
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Equivalence groups" },
        ]}
        title="Villa equivalence groups"
        description="Groups of swap-comparable villas. Used by the relocation engine: a booking can only be relocated to a villa in the same group with same-or-better quality_rank."
        actions={<AddEquivalenceGroupButton />}
      />

      {groupsWithMembers.length === 0 ? (
        <NoItemsYet
          entityLabel="equivalence groups"
          description="Group swap-comparable villas so the relocation engine can move bookings between them with a same-or-better quality rank."
          addAction={<AddEquivalenceGroupButton />}
        />
      ) : (
        groupsWithMembers.map((g) => (
          <Section
            key={g.id}
            eyebrow={g.projectName ?? "global"}
            title={g.name}
            action={
              <OwnersRowActions
                kind="equivalence_group"
                row={{
                  id: g.id,
                  displayName: g.name,
                  values: {
                    name: g.name,
                    projectId: g.projectId ?? "",
                    description: g.description ?? "",
                  },
                }}
              />
            }
          >
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="text-left px-3 py-2">Villa</th>
                    <th className="text-right px-3 py-2">Quality rank</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {g.members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-ink font-medium">{m.villaCode ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.qualityRank}</td>
                      <td className="px-3 py-2">
                        <Badge tone={m.villaStatus === "active" ? "success" : "neutral"}>
                          {m.villaStatus ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-ink-tertiary text-xs">{m.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddEquivalenceMemberForm
              groupId={g.id}
              villas={allVillas
                .filter((v) => !g.members.some((m) => m.villaId === v.id))
                .map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
            />
          </Section>
        ))
      )}
    </div>
  );
}
