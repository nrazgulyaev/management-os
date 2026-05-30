import { redirect } from "next/navigation";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";
import { getVillaHeroUrls } from "@/features/owner-portal/get-owner-insights";

/**
 * OWNER-PORTAL-1A — My villas (live from ownership_shares).
 */

export const metadata = { title: "My villas" };
export const dynamic = "force-dynamic";

const VILLA_GRADIENTS = [
  "linear-gradient(135deg, #c4a572 0%, #6b5436 100%)",
  "linear-gradient(135deg, #5a6e7a 0%, #2c3848 100%)",
  "linear-gradient(135deg, #8c6f4f 0%, #3a2c1d 100%)",
  "linear-gradient(135deg, #6b7d62 0%, #2f3a26 100%)",
];

function fmtUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

export default async function OwnerVillasPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");
  const villas = await listMyVillas(owner.ownerId);
  const heroUrls = await getVillaHeroUrls(villas.map((v) => v.villaId)).catch(
    () => ({}) as Record<string, string>,
  );

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Portfolio · villas"
        title="Your villas"
        subtitle={
          villas.length === 0
            ? "No villa ownership recorded yet."
            : `${villas.length} ${villas.length === 1 ? "villa" : "villas"} with ownership shares on record.`
        }
      />

      {villas.length === 0 ? (
        <p className="text-sm text-ink-tertiary italic">
          Your ownership shares are configured by your operator. If something is
          missing, get in touch.
        </p>
      ) : (
        <section>
          <div className="label">Owned villas</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            Performance · this month
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {villas.map((v, i) => (
              <div
                key={v.villaId}
                id={v.villaCode ?? undefined}
                className="rounded-lg border border-line-soft bg-surface overflow-hidden flex flex-col"
              >
                <div
                  style={
                    heroUrls[v.villaId]
                      ? {
                          backgroundImage: `url(${heroUrls[v.villaId]})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          height: 120,
                        }
                      : {
                          background: VILLA_GRADIENTS[i % VILLA_GRADIENTS.length],
                          height: 120,
                        }
                  }
                />
                <div className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-tertiary">
                      {v.villaCode}
                    </span>
                    <Badge tone="outline">{v.sharePercent}% share</Badge>
                  </div>
                  <div>
                    <h3 className="text-display text-[20px] leading-tight font-medium text-ink">
                      {v.villaName ?? v.villaCode ?? "Villa"}
                    </h3>
                    <p className="text-xs text-ink-tertiary mt-0.5">
                      {v.projectName ?? "—"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-line-soft text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                        MTD net
                      </div>
                      <div className="font-mono tabular-nums text-ink mt-0.5">
                        {v.mtdNetUsdMinor > 0n ? fmtUsd(v.mtdNetUsdMinor) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                        Occupancy
                      </div>
                      <div className="font-mono tabular-nums text-ink mt-0.5">
                        {v.occupancyPct > 0 ? `${v.occupancyPct}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                        ADR
                      </div>
                      <div className="font-mono tabular-nums text-ink mt-0.5">
                        {v.adrUsdMinor > 0n ? fmtUsd(v.adrUsdMinor) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
