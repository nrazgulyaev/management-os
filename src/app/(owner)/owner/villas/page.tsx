import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";
import { getVillaHeroUrls } from "@/features/owner-portal/get-owner-insights";
import { SectionHeading } from "@/components/dashboard/primitives";
import { VillaCard } from "@/components/owner-portal/villa-card";

/**
 * Sprint OWNER-PORTAL · redesign owner-03 — Villas list.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/03-villas.html (list
 * variant). Wires the Phase 2.3 VillaCard to listMyVillas (incl. real
 * bedrooms). Per the prototype spec the list only exists for 2+ villas —
 * a single-villa owner is sent straight to that villa's detail.
 */

export const metadata = { title: "Your villas" };
export const dynamic = "force-dynamic";

export default async function OwnerVillasPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const villas = await listMyVillas(owner.ownerId);

  // Prototype: list only for 2+ villas; otherwise jump to the detail.
  if (villas.length === 1) redirect(`/owner/villas/${villas[0].villaId}`);

  const heroUrls = await getVillaHeroUrls(villas.map((v) => v.villaId)).catch(
    () => ({}) as Record<string, string>,
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Your villas"
        title="Your portfolio"
        subtitle={
          villas.length === 0
            ? "No villa ownership recorded yet — your shares are configured by your operator."
            : `${villas.length} villas with ownership shares on record.`
        }
      />

      {villas.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line-strong p-8">
          <p className="text-sm text-ink-tertiary italic">
            Your ownership shares are configured by your operator. If something
            is missing, reach out via your inbox.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {villas.map((v) => (
            <VillaCard
              key={v.villaId}
              href={`/owner/villas/${v.villaId}`}
              code={v.villaCode ?? "—"}
              name={v.villaName ?? v.villaCode ?? "Villa"}
              imageUrl={heroUrls[v.villaId] ?? null}
              bedrooms={v.bedrooms}
              occupancyPct={Math.round(v.occupancyPct)}
              netUsd={Number(v.mtdNetUsdMinor) / 100}
              location={v.projectName ?? undefined}
              orientation="col"
            />
          ))}
        </div>
      )}
    </div>
  );
}
