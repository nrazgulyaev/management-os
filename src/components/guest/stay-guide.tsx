import { Wifi, KeyRound, BookOpenText, MapPin } from "lucide-react";

const guideCards = [
  {
    icon: KeyRound,
    label: "Check-in",
    title: "Smart-lock code available 24 h before arrival",
    detail:
      "Your personal code will appear here on 25 April 2026, 15:00 WITA. The villa is self-check-in — drive straight in through the main gate.",
    cta: "View check-in details",
  },
  {
    icon: Wifi,
    label: "Wi-Fi",
    title: "Enso Guest · high-speed fibre",
    detail: "Password revealed on arrival in the welcome card and the guide.",
    cta: "Open guide",
  },
  {
    icon: BookOpenText,
    label: "Villa guide",
    title: "Appliances, amenities & quirks",
    detail:
      "How to use the air conditioning, pool, espresso machine, and outdoor kitchen. Illustrated and typeset — not a spreadsheet.",
    cta: "Read the guide",
  },
  {
    icon: MapPin,
    label: "Neighborhood",
    title: "Berawa, curated by our concierge",
    detail:
      "Dining, beach clubs, surf, yoga, and coffee — vetted picks within a 10-minute ride.",
    cta: "Open the map",
  },
];

export function StayGuide() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {guideCards.map((c, i) => {
        const Icon = c.icon;
        return (
          <article
            key={i}
            className="rounded-lg border border-line-soft bg-surface p-5 flex flex-col gap-3"
          >
            <div className="w-9 h-9 rounded-md bg-accent-weak text-accent inline-flex items-center justify-center">
              <Icon className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div>
              <span className="text-label">{c.label}</span>
              <h3 className="text-display text-[18px] leading-tight font-medium mt-1 text-ink">
                {c.title}
              </h3>
              <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                {c.detail}
              </p>
            </div>
            <button
              type="button"
              className="mt-auto text-sm text-ink underline-offset-4 hover:underline self-start"
            >
              {c.cta} →
            </button>
          </article>
        );
      })}
    </div>
  );
}
