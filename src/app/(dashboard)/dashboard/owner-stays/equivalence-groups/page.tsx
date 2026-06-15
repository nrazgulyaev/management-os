import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  listEquivalenceGroups,
  listEquivalenceMembers,
} from "@/features/owner-stays/services";
import { listVillas } from "@/features/villas/services";
import { AddEquivalenceMemberForm } from "@/components/owner-stays/add-member-form";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { AddEquivalenceGroupButton } from "@/components/dashboard/owners/owners-add-buttons";
import { NoItemsYet } from "@/components/ui/primitives";
import { removeEquivalenceMemberAction } from "@/features/owner-stays/actions";
import Link from "next/link";

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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-stays">Owner stays</Link> /{" "}
            <span>Equivalence groups</span>
          </div>
          <h1>Villa equivalence groups</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Groups of swap-comparable villas. Used by the relocation engine: a
            booking can only be relocated to a villa in the same group with
            same-or-better quality_rank.
          </p>
        </div>
        <div className="actions">
          <AddEquivalenceGroupButton />
        </div>
      </div>

      {groupsWithMembers.length === 0 ? (
        <NoItemsYet
          entityLabel="equivalence groups"
          description="Group swap-comparable villas so the relocation engine can move bookings between them with a same-or-better quality rank."
          addAction={<AddEquivalenceGroupButton />}
        />
      ) : (
        groupsWithMembers.map((g) => (
          <div key={g.id} className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <div className="label mb-2.5">{g.projectName ?? "global"}</div>
                <h2 className="serif text-[22px] m-0">{g.name}</h2>
              </div>
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
            </div>
            <Card padding="none" overflowHidden>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Villa</th>
                    <th scope="col" className="num">Quality rank</th>
                    <th scope="col">Status</th>
                    <th scope="col">Notes</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.members.map((m) => (
                    <tr key={m.id}>
                      <td className="row-title">{m.villaCode ?? "—"}</td>
                      <td className="num">{m.qualityRank}</td>
                      <td>
                        <HandoffBadge tone={m.villaStatus === "active" ? "ok" : "soft"}>
                          {m.villaStatus ?? "—"}
                        </HandoffBadge>
                      </td>
                      <td className="text-ink-3 text-xs">{m.notes ?? "—"}</td>
                      <td className="text-right">
                        {m.status === "archived" ? (
                          <span className="text-ink-3 text-xs">Removed</span>
                        ) : (
                          <form
                            action={async (fd: FormData) => {
                              "use server";
                              await removeEquivalenceMemberAction(fd);
                            }}
                          >
                            <input type="hidden" name="id" value={m.id} />
                            <button
                              type="submit"
                              className="text-xs text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <AddEquivalenceMemberForm
              groupId={g.id}
              villas={allVillas
                .filter((v) => !g.members.some((m) => m.villaId === v.id))
                .map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
            />
          </div>
        ))
      )}
    </div>
  );
}
