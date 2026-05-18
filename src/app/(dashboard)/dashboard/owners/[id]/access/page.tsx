import { notFound } from "next/navigation";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { GrantForm } from "@/components/admin/grant-form";
import { getOwnerById } from "@/features/owners/services";
import { listAccessGrantsForOwner } from "@/features/access-grants/services";
import { listAppUsers } from "@/features/auth/users-service";
import {
  reactivateOwnerAccessGrantAction,
  revokeOwnerAccessGrantAction,
} from "@/features/access-grants/actions";

export const metadata = { title: "Owner access" };
export const dynamic = "force-dynamic";

export default async function OwnerAccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getOwnerById(id);
  if (!owner) notFound();
  const grants = await listAccessGrantsForOwner(id);
  const users = await listAppUsers();

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow={`Portfolio · owners · ${owner.displayName} · access`}
        title={`${owner.displayName} · access grants`}
        subtitle="Grant or revoke owner-portal access. Replaces the legacy email-match heuristic with explicit, audited grants."
      />
      <DbStatusNotice />

      <section>
        <div className="label">Active grants</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Who can read this owner&apos;s data
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>App user</TH>
              <TH>Email</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH>Granted</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <TBody>
            {grants.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-center py-8 text-ink-tertiary">
                  No grants yet.
                </TD>
              </TR>
            ) : (
              grants.map((g) => (
                <TR key={g.id}>
                  <TD className="text-ink">{g.appUserName}</TD>
                  <TD className="text-ink-secondary text-sm">{g.appUserEmail}</TD>
                  <TD>
                    <Badge tone="outline">{g.grantType}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={g.status === "active" ? "success" : "neutral"}>
                      {g.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {new Date(g.grantedAt).toLocaleDateString("en-GB")}
                    {g.grantedByName ? ` · by ${g.grantedByName}` : ""}
                  </TD>
                  <TD>
                    {g.status === "active" ? (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          formData.set("id", g.id);
                          await revokeOwnerAccessGrantAction(null, formData);
                        }}
                      >
                        <Button size="sm" variant="ghost" type="submit">
                          Revoke
                        </Button>
                      </form>
                    ) : (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          formData.set("id", g.id);
                          await reactivateOwnerAccessGrantAction(null, formData);
                        }}
                      >
                        <Button size="sm" variant="ghost" type="submit">
                          Reactivate
                        </Button>
                      </form>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>

      <section>
        <div className="label">Grant access</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Add an app user to this owner
        </h2>
        <GrantForm
          fixedOwnerId={owner.id}
          appUsers={users.map((u) => ({ id: u.id, label: `${u.fullName} · ${u.email}` }))}
          cancelHref={`/dashboard/owners/${owner.id}`}
        />
      </section>
    </div>
  );
}
