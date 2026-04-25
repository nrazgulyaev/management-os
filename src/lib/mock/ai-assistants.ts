import {
  Sparkles,
  LineChart,
  HandCoins,
  Settings2,
  MessageCircle,
  Wrench,
  Package,
  FileText,
  type LucideIcon,
} from "lucide-react";

export interface MockAssistant {
  id: string;
  name: string;
  shortName: string;
  description: string;
  targetUsers: string;
  examplePrompt: string;
  escalation: string;
  surfaces: string[];
  icon: LucideIcon;
  phase: string;
  tone: "emerald" | "gold" | "sage" | "stone" | "terracotta" | "ink";
}

export const mockAssistants: MockAssistant[] = [
  {
    id: "investor",
    name: "Investor Assistant",
    shortName: "Investor",
    description:
      "Explains owner statements with line-by-line citations. Never invents a number.",
    targetUsers: "Investor · Owner · Delegate",
    examplePrompt:
      "Why did my March payout drop 18% versus February on Eternal 07?",
    escalation: "Any dispute or distrust signal routed to the Director.",
    surfaces: ["/owner/assistant", "Statement drawer"],
    icon: LineChart,
    phase: "v3",
    tone: "emerald",
  },
  {
    id: "finance",
    name: "Finance Analyst",
    shortName: "Finance",
    description:
      "GOP, NOI, ADR, RevPAR, variance detection and narrative drafting across the portfolio.",
    targetUsers: "Finance Manager · Director · Accountant",
    examplePrompt:
      "Top 10 expense categories YTD for Eternal Villas, grouped by villa.",
    escalation:
      "Closed-period writes require Director override — assistant refuses and redirects.",
    surfaces: ["/dashboard/ai/finance", "Finance drawer"],
    icon: HandCoins,
    phase: "v3",
    tone: "gold",
  },
  {
    id: "operations",
    name: "Operations Copilot",
    shortName: "Operations",
    description:
      "Today's turnovers, SLA risk, task reassignment, complaint summaries.",
    targetUsers: "Ops Manager · Property Manager · Housekeeping Sup.",
    examplePrompt:
      "Which villas are at risk of a late check-in today across Eternal Villas?",
    escalation:
      "Safety / guest injury inferred → automatic escalation to Director.",
    surfaces: ["/dashboard/ai/operations", "Status board"],
    icon: Settings2,
    phase: "v4",
    tone: "sage",
  },
  {
    id: "maintenance",
    name: "Maintenance Assistant",
    shortName: "Maintenance",
    description:
      "Draft resolutions, lookup warranty documents, propose purchase requests.",
    targetUsers: "Ops Manager · Technician",
    examplePrompt:
      "Likely causes for 'AC not cold' on ES-S6 given warranty notes.",
    escalation:
      "P1 severity always escalates to Director + Operations Manager.",
    surfaces: ["/dashboard/ai/maintenance", "Ticket drawer"],
    icon: Wrench,
    phase: "v4",
    tone: "stone",
  },
  {
    id: "procurement",
    name: "Procurement Assistant",
    shortName: "Procurement",
    description:
      "Low-stock forecasts, supplier scoring, draft POs — never auto-sent.",
    targetUsers: "Procurement Manager · Ops",
    examplePrompt:
      "Recommend a bamboo linen supplier prioritized by lead time.",
    escalation:
      "PR above role threshold routes to Director approval queue.",
    surfaces: ["/dashboard/ai/procurement", "PR drawer"],
    icon: Package,
    phase: "v5",
    tone: "emerald",
  },
  {
    id: "report_writer",
    name: "Report Writer",
    shortName: "Reports",
    description:
      "Drafts monthly operations reports, investor letters, board summaries with citations.",
    targetUsers: "Director · Finance · Ops Manager",
    examplePrompt:
      "Draft the Q1 investor letter for Enso pool members, 600 words.",
    escalation:
      "External reports require second-eye approval before PDF publish.",
    surfaces: ["/dashboard/ai/report-writer", "Reports composer"],
    icon: FileText,
    phase: "v4",
    tone: "gold",
  },
  {
    id: "guest",
    name: "Guest Concierge",
    shortName: "Concierge",
    description:
      "Tokenized guest-side help: guide, Wi-Fi, upsells, service requests. Never reveals smart-lock code.",
    targetUsers: "Guest (via signed stay token)",
    examplePrompt:
      "Please book a private chef tomorrow at 7pm for four people.",
    escalation:
      "Safety / medical → instant WhatsApp handoff + SMS to concierge.",
    surfaces: ["/stay/[token]/concierge"],
    icon: MessageCircle,
    phase: "v6",
    tone: "sage",
  },
  {
    id: "crm",
    name: "CRM Assistant",
    shortName: "CRM",
    description:
      "Draft replies, classify leads, match villas to prospect briefs. Never auto-sends.",
    targetUsers: "Sales · Director · Concierge",
    examplePrompt:
      "Draft a reply in Japanese to this Enso Villas family inquiry.",
    escalation:
      "VIP / press / competitor signals routed to Director directly.",
    surfaces: ["/dashboard/ai/crm", "Lead drawer"],
    icon: Sparkles,
    phase: "v7",
    tone: "terracotta",
  },
];
