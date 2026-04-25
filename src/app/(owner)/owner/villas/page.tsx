import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "My villas" };

const ownedVillas = [
  {
    id: "ev-07",
    name: "Eternal 07",
    project: "Eternal Villas",
    code: "EV-07",
    share: 100,
    model: "Hybrid",
    bedrooms: 3,
    location: "Ubud",
    ytdRevenue: "Rp 1.96B",
    occupancy: "82.0%",
    ytdPayout: "Rp 284.6M",
    reserveBalance: "Rp 62.4M",
    openTickets: 0,
  },
  {
    id: "es-s5",
    name: "Enso S5",
    project: "Enso Villas",
    code: "ES-S5",
    share: 100,
    model: "Pooled (opt-in)",
    bedrooms: 4,
    location: "Berawa",
    ytdRevenue: "Rp 2.41B",
    occupancy: "89.1%",
    ytdPayout: "Rp 399.6M",
    reserveBalance: "Rp 62.4M",
    openTickets: 0,
  },
];

const pool = {
  project: "Enso Villas",
  share: 3,
  ytdDistribution: "Rp 192.6M",
  members: 9,
  netProfitYTD: "Rp 6.42B",
};

export default function OwnerVillasPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Portfolio", href: "/owner" }, { label: "My villas" }]}
        title="My villas & shares"
        description="Two fully-owned villas and a pool participation in Enso Villas."
      />

      <Section eyebrow="Owned villas" title="Villas you own outright">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ownedVillas.map((v) => (
            <div
              key={v.id}
              id={v.id}
              className="scroll-mt-28 rounded-lg border border-line-soft bg-surface p-7 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-tertiary">
                  {v.code}
                </span>
                <Badge tone="success">{v.share}% owner</Badge>
              </div>
              <div>
                <h3 className="text-display text-[26px] leading-tight font-medium text-ink">
                  {v.name}
                </h3>
                <p className="text-sm text-ink-secondary mt-1">
                  {v.project} · {v.location} · {v.bedrooms} bedrooms
                </p>
                <p className="text-xs text-ink-tertiary mt-2">
                  Ownership model: {v.model}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 pt-5 border-t border-line-soft">
                <Metric label="YTD revenue" value={v.ytdRevenue} />
                <Metric label="Occupancy YTD" value={v.occupancy} />
                <Metric label="YTD payout" value={v.ytdPayout} />
                <Metric label="Reserve balance" value={v.reserveBalance} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Pool participation" title="Pooled holdings">
        <div className="rounded-lg border border-line-soft bg-surface p-7">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-display text-[24px] leading-tight font-medium text-ink">
                {pool.project} · Pool
              </h3>
              <p className="text-sm text-ink-secondary mt-1">
                {pool.members} pool members · weighted monthly distribution
              </p>
            </div>
            <Badge tone="gold">{pool.share}% share</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-line-soft">
            <Metric label="YTD distribution" value={pool.ytdDistribution} />
            <Metric label="Pool net profit YTD" value={pool.netProfitYTD} />
            <Metric label="Next distribution" value="5 May 2026" />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="font-mono tabular-nums text-base text-ink mt-1">
        {value}
      </div>
    </div>
  );
}
