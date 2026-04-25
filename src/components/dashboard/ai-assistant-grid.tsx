import { mockAssistants } from "@/lib/mock/ai-assistants";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ShieldCheck, ShieldOff, ArrowUpRight } from "lucide-react";

const toneBgClass: Record<string, string> = {
  emerald: "bg-accent-weak text-accent",
  gold: "bg-gold-weak text-gold",
  sage: "bg-success-weak text-success",
  stone: "bg-muted text-ink-secondary",
  terracotta: "bg-danger-weak text-danger",
  ink: "bg-ink text-ink-inverse",
};

// Per-assistant scope rules. Mirrors docs/AI_ASSISTANTS_STRATEGY.md.
const scopeRules: Record<
  string,
  { allowed: string[]; forbidden: string[] }
> = {
  investor: {
    allowed: [
      "Owner's villas, shares, statements, payouts",
      "Reserves, taxes, allocations in scope",
      "Documents the owner is authorised to read",
    ],
    forbidden: [
      "Other owners' identities, shares, payouts",
      "Guest PII beyond initials and dates",
      "Internal margins, supplier identities",
    ],
  },
  finance: {
    allowed: [
      "Full revenue, expense, fee, tax, reserve ledgers",
      "Statements, payouts, bank reconciliation state",
      "Allocation rules + version history",
    ],
    forbidden: [
      "Guest passport / KYC raw documents",
      "Camera content (events only, not video)",
    ],
  },
  operations: {
    allowed: [
      "Tasks, checklists, maintenance, preventive",
      "Villa statuses, staff rotas, complaints",
      "Booking arrival / departure timing",
    ],
    forbidden: [
      "Owner-level finance detail",
      "Guest PII beyond booking card",
      "Live camera feeds",
    ],
  },
  maintenance: {
    allowed: [
      "Tickets, equipment registry, warranties",
      "Supplier catalog for parts, prior repairs",
      "Maintenance playbooks",
    ],
    forbidden: [
      "Owner finance detail beyond maintenance costs",
      "Guest PII",
    ],
  },
  procurement: {
    allowed: [
      "Inventory items, stock, movements",
      "Suppliers, PO history, price history",
      "Usage patterns per villa",
    ],
    forbidden: ["Owner finance detail", "Staff personal data"],
  },
  report_writer: {
    allowed: [
      "Whatever the user can read (scoped)",
      "Past reports as style templates",
      "Brand voice guidelines",
    ],
    forbidden: [
      "Beyond the user's scope",
      "Guest PII or fellow-investor identities in general reports",
    ],
  },
  guest: {
    allowed: [
      "The current booking and its villa guide",
      "Upsell catalog for this villa",
      "Stay-scoped service requests + messages",
    ],
    forbidden: [
      "Other bookings, other villas",
      "Owner / finance / staff data",
      "Smart-lock code (never via chat)",
    ],
  },
  crm: {
    allowed: [
      "Leads, pipeline, activities, owners (existing)",
      "Inbound messages across channels",
      "UTM + campaign data",
    ],
    forbidden: [
      "Finance detail beyond deal-size summary",
      "Operational issues unrelated to the lead",
      "Other agents' pipelines (unless Director)",
    ],
  },
};

export function AIAssistantGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {mockAssistants.map((a) => {
        const Icon = a.icon;
        const scope = scopeRules[a.id];
        return (
          <article
            key={a.id}
            className="group rounded-lg border border-line-soft bg-surface flex flex-col overflow-hidden"
          >
            <header className="px-6 pt-6 pb-5 border-b border-line-soft flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-md inline-flex items-center justify-center shrink-0 ${toneBgClass[a.tone]}`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-display text-[20px] leading-tight font-medium text-ink">
                    {a.name}
                  </h3>
                  <Badge tone="outline">{a.phase}</Badge>
                </div>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                  {a.description}
                </p>
              </div>
            </header>

            <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 border-b border-line-soft">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                  Allowed data
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {scope?.allowed.map((row) => (
                    <li
                      key={row}
                      className="flex items-start gap-2 text-xs text-ink-secondary leading-relaxed"
                    >
                      <span className="w-1 h-1 rounded-full bg-success mt-1.5 shrink-0" />
                      {row}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary flex items-center gap-1">
                  <ShieldOff className="w-3 h-3" strokeWidth={1.75} />
                  Forbidden
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {scope?.forbidden.map((row) => (
                    <li
                      key={row}
                      className="flex items-start gap-2 text-xs text-ink-secondary leading-relaxed"
                    >
                      <span className="w-1 h-1 rounded-full bg-danger mt-1.5 shrink-0" />
                      {row}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="px-6 py-5 flex flex-col gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  Example prompt
                </div>
                <p className="text-sm text-ink italic mt-1.5 leading-relaxed">
                  "{a.examplePrompt}"
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                  <Sparkles className="w-3 h-3" />
                  <span className="truncate">Users · {a.targetUsers}</span>
                </div>
                <div className="text-[11px] text-warning leading-snug">
                  Escalation · {a.escalation}
                </div>
              </div>
            </div>

            <footer className="mt-auto px-6 py-3 border-t border-line-soft bg-muted/30 flex items-center justify-between">
              <span className="text-[11px] text-ink-tertiary">
                Surfaces · {a.surfaces.join(" · ")}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-tertiary">
                Preview <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
              </span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
