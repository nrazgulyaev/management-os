import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  listEmergencyContactsAdmin,
  listGuideSectionsAdmin,
  listNeighborhoodAdmin,
  listWifiAdmin,
} from "@/features/villa-guides/services";

export const metadata = { title: "Villa guides" };
export const dynamic = "force-dynamic";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function VillaGuidesHub() {
  const [sections, wifi, contacts, places] = await Promise.all([
    listGuideSectionsAdmin(),
    listWifiAdmin(),
    listEmergencyContactsAdmin(),
    listNeighborhoodAdmin(),
  ]);

  const recent = [...sections]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 12);

  const navCards = [
    { href: "/dashboard/villa-guides/sections", title: "Sections", detail: `${sections.length} guide sections` },
    { href: "/dashboard/villa-guides/wifi", title: "Wi-Fi", detail: `${wifi.length} encrypted entries` },
    { href: "/dashboard/villa-guides/emergency-contacts", title: "Emergency contacts", detail: `${contacts.length} contacts` },
    { href: "/dashboard/villa-guides/neighborhood", title: "Neighborhood", detail: `${places.length} curated places` },
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> / <span>Villa guides</span>
          </div>
          <h1>Villa guides</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            The welcome book your guests actually read. Project-level defaults,
            villa-level overrides — villa rows beat project rows at the same key.
            Wi-Fi encrypted at rest; emergency contacts visible offline.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/villa-guides/security/wifi-migration"
            className="btn btn-secondary btn-sm"
          >
            Migration sweep →
          </Link>
          <Link href="/dashboard/villa-guides/sections" className="btn btn-accent btn-sm">
            Sections →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Sections" value={String(sections.length)} sub="guide content" />
        <Kpi
          label="Wi-Fi entries"
          value={String(wifi.length)}
          sub="all encrypted"
          tone={wifi.length > 0 ? "success" : undefined}
        />
        <Kpi label="Emergency contacts" value={String(contacts.length)} sub="offline-visible" />
        <Kpi label="Neighborhood places" value={String(places.length)} sub="curated" tone="gold" />
      </div>

      {/* Recently edited sections */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal">Recently edited sections</h2>
        <Link
          href="/dashboard/villa-guides/sections"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All sections →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Section</th>
              <th>Key</th>
              <th>Scope</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-ink-3 italic py-8">
                  No guide sections yet.
                </td>
              </tr>
            ) : (
              recent.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td className="mono text-[11px] text-ink-3">{s.sectionKey}</td>
                  <td className="text-[12px] text-ink-3">
                    {s.villaId ? "Villa" : s.projectId ? "Project" : "Global"}
                  </td>
                  <td>
                    <Badge tone={s.status === "active" ? "success" : "warning"}>
                      {s.status === "active" ? "Published" : s.status}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(s.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {navCards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
