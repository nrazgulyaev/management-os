import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listEmergencyContactsAdmin } from "@/features/villa-guides/services";
import { VillaGuidesRowActions } from "@/components/dashboard/villa-guides/villa-guides-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Emergency contacts" };
export const dynamic = "force-dynamic";

export default async function EmergencyContactsList() {
  const rows = await listEmergencyContactsAdmin();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Emergency contacts" },
        ]}
        title="Emergency contacts"
        description="Police, hospital, concierge, manager. The villa-scoped list replaces the project-scoped fallback."
        actions={
          <Link
            href="/dashboard/villa-guides/emergency-contacts/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + New contact
          </Link>
        }
      />
      <Section eyebrow="Catalog" title={`${rows.length} contacts`}>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="emergency contacts"
            description="Add police, ambulance, fire, hospital, and concierge contacts so the guest stay app surfaces them."
            addHref="/dashboard/villa-guides/emergency-contacts/new"
            addLabel="+ New contact"
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Label</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Visible</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary">{r.contactType}</td>
                    <td className="px-3 py-2 text-ink font-medium">{r.label}</td>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.guestVisible ? "success" : "neutral"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
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
          </div>
        )}
      </Section>
    </div>
  );
}
