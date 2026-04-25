import { Cigarette, PawPrint, Music2, Users, Sparkles } from "lucide-react";

const rules = [
  {
    icon: Users,
    title: "Maximum guests",
    body: "Up to 8 guests in residence. Day visitors welcome up to 11pm with prior notice.",
  },
  {
    icon: Music2,
    title: "Quiet hours",
    body: "Out of respect for the neighbourhood, music outdoors should be reduced after 22:00.",
  },
  {
    icon: Cigarette,
    title: "Non-smoking interior",
    body: "Interiors are non-smoking. Designated outdoor area provided by the pool deck.",
  },
  {
    icon: PawPrint,
    title: "Pets",
    body: "Pets are not permitted, with the exception of service animals (please notify the host in advance).",
  },
  {
    icon: Sparkles,
    title: "Daily housekeeping",
    body: "Housekeeping visits daily between 09:00 and 11:00. You may request a different window via the concierge.",
  },
];

export function HouseRules() {
  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-line-soft flex items-baseline justify-between gap-4">
        <span className="text-label">House rules</span>
        <span className="text-[11px] text-ink-tertiary">Acknowledged at booking</span>
      </div>
      <ul className="divide-y divide-line-soft">
        {rules.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.title} className="flex gap-4 px-5 py-4">
              <div className="w-8 h-8 rounded-md bg-muted text-ink-secondary inline-flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div>
                <div className="text-sm text-ink font-medium">{r.title}</div>
                <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                  {r.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
