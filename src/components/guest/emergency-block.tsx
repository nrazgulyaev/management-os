import { ShieldAlert, Phone, MessageCircle } from "lucide-react";

const contacts = [
  { label: "Villa host (24/7)", value: "+62 812 555 1010", action: "tel:+628125551010", icon: Phone },
  { label: "WhatsApp concierge", value: "+62 812 555 1010", action: "https://wa.me/628125551010", icon: MessageCircle },
  { label: "Emergency · ambulance", value: "118", action: "tel:118", icon: ShieldAlert },
  { label: "Emergency · police", value: "110", action: "tel:110", icon: ShieldAlert },
];

export function EmergencyBlock() {
  return (
    <section className="rounded-lg border border-danger/30 bg-danger-weak/40 overflow-hidden">
      <header className="px-5 py-4 border-b border-danger/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-danger text-white inline-flex items-center justify-center">
          <ShieldAlert className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div>
          <div className="text-sm font-medium text-ink">Emergency contacts</div>
          <div className="text-xs text-ink-tertiary">
            Always reachable, day or night.
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line-soft">
        {contacts.map((c) => {
          const Icon = c.icon;
          return (
            <a
              key={c.label}
              href={c.action}
              className="flex items-center gap-3 px-5 py-4 hover:bg-surface/60 transition-colors"
            >
              <Icon className="w-4 h-4 text-ink-secondary shrink-0" strokeWidth={1.75} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  {c.label}
                </div>
                <div className="text-sm text-ink font-mono tabular-nums">
                  {c.value}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
