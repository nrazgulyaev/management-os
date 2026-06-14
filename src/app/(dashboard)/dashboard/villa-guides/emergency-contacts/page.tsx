import Link from "next/link";
import { HandoffBadge, Card } from "@/components/dashboard/primitives";
import { listEmergencyContactsAdmin } from "@/features/villa-guides/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { VillaGuidesRowActions } from "@/components/dashboard/villa-guides/villa-guides-row-actions";
import { ContactAddButton } from "@/components/villa-guides/contact-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Emergency contacts" };
export const dynamic = "force-dynamic";

export default async function EmergencyContactsList() {
  const [rows, villas, projects] = await Promise.all([
    listEmergencyContactsAdmin(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <span>Emergency contacts</span>
          </div>
          <h1>Emergency contacts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Police, hospital, concierge, manager. The villa-scoped list replaces
            the project-scoped fallback.
          </p>
        </div>
        <div className="actions">
          <ContactAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Catalog · {rows.length} contacts</div>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="emergency contacts"
            description="Add police, ambulance, fire, hospital, and concierge contacts so the guest stay app surfaces them."
            addHref="/dashboard/villa-guides/emergency-contacts/new"
            addLabel="+ New contact"
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Type</th>
                  <th scope="col">Label</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Visible</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-3 text-xs">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="text-ink-3">{r.contactType}</td>
                    <td className="row-title">{r.label}</td>
                    <td className="num">{r.phone ?? "—"}</td>
                    <td>
                      <HandoffBadge tone={r.guestVisible ? "ok" : "soft"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
                      <VillaGuidesRowActions
                        kind="contact"
                        row={{
                          id: r.id,
                          displayName: r.label,
                          values: {
                            villaId: r.villaId ?? "",
                            projectId: r.projectId ?? "",
                            label: r.label,
                            contactType: r.contactType,
                            phone: r.phone ?? "",
                            whatsapp: r.whatsapp ?? "",
                            email: r.email ?? "",
                            address: r.address ?? "",
                            sortOrder: r.sortOrder,
                            guestVisible: r.guestVisible,
                          },
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
