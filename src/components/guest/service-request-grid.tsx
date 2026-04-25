import { ArrowUpRight } from "lucide-react";

const services = [
  { n: "Airport transfer", p: "Rp 650k", d: "Premium SUV, English-speaking driver" },
  { n: "Private chef", p: "from Rp 1.2M / pax", d: "4-course set menu or à la carte" },
  { n: "In-villa massage", p: "from Rp 450k / hr", d: "Two practitioners, book 3 hrs ahead" },
  { n: "Extra cleaning", p: "Rp 380k", d: "On-demand mid-stay turnover" },
  { n: "Laundry", p: "Rp 18k / kg", d: "Same-day if before 10:00" },
  { n: "Scooter rental", p: "Rp 90k / day", d: "Delivered, fuelled, helmets included" },
  { n: "Driver for the day", p: "Rp 850k", d: "10 hours, up to 100 km" },
  { n: "Breakfast in villa", p: "Rp 220k / pax", d: "Continental, Indonesian, or plant-based" },
];

export function ServiceRequestGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {services.map((s) => (
        <button
          key={s.n}
          type="button"
          className="text-left group rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-2 hover:border-line-strong transition-colors"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-ink font-medium text-sm">{s.n}</div>
              <div className="text-xs text-ink-tertiary mt-1">{s.d}</div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" />
          </div>
          <div className="mt-auto pt-3 border-t border-line-soft flex items-center justify-between">
            <span className="text-label">From</span>
            <span className="font-mono tabular-nums text-sm text-ink">
              {s.p}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
