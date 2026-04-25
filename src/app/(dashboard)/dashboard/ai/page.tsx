import { PageHeader } from "@/components/ui/page-header";
import { AIAssistantGrid } from "@/components/dashboard/ai-assistant-grid";
import { PermissionBanner } from "@/components/dashboard/permission-banner";
import { AIAuditLog } from "@/components/dashboard/ai-audit-log";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileSignature, BellRing, ScrollText } from "lucide-react";

export const metadata = { title: "AI assistants" };

const principles = [
  {
    icon: ShieldCheck,
    title: "Permission-aware retrieval",
    body: "Every assistant runs in the requesting user's auth context. Retrieval queries hit the same database with the same row-level security. No service-role read for AI.",
  },
  {
    icon: ScrollText,
    title: "Cite, never invent",
    body: "Every numeric or factual claim is grounded in retrieved rows with an inline citation. If retrieval is empty, the assistant says it doesn't have access.",
  },
  {
    icon: FileSignature,
    title: "Human approval for sensitive writes",
    body: "Statement publishes, payouts, access codes, role grants, and capex above threshold are never executed by AI without an explicit human action.",
  },
  {
    icon: BellRing,
    title: "Audit-logged end-to-end",
    body: "Every prompt, retrieval, tool call, and response is logged with actor, scope, sources, latency, and outcome. Reviewable by Super Admin and Director.",
  },
];

export default function AIHubPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        breadcrumbs={[{ label: "Intelligence", href: "/dashboard" }, { label: "AI assistants" }]}
        eyebrow="Intelligence"
        title="Eight permission-aware assistants."
        description="Each assistant runs in your auth context, retrieves only what you can see, cites every source, and refuses to invent numbers. Tools that mutate require explicit confirmation."
      />

      <PermissionBanner />

      <Section
        eyebrow="Principles"
        title="The rules every assistant follows."
        description="These principles are architectural, not advisory. They are enforced in retrieval, prompting, tool execution, and audit."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {principles.map((p) => {
            const Icon = p.icon;
            return (
              <article
                key={p.title}
                className="rounded-md border border-line-soft bg-surface p-5 flex gap-4"
              >
                <div className="w-9 h-9 rounded-md bg-accent-weak text-accent inline-flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-ink font-medium text-base">{p.title}</h3>
                  <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Assistants"
        title="Eight assistants. One trust model."
        description="Each card lists allowed and forbidden data, an example prompt, and the escalation rule the assistant must follow."
      >
        <AIAssistantGrid />
      </Section>

      <Section
        eyebrow="Audit"
        title="Live AI audit log."
        description="Every assistant turn is recorded — prompt, retrieved sources, tools, response, latency, and outcome. Sample entries below."
      >
        <AIAuditLog />
      </Section>

      <div className="rounded-lg border border-warning/30 bg-warning-weak/40 p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
        <Badge tone="warning">Preview</Badge>
        <p className="text-sm text-ink leading-relaxed">
          The AI runtime, retrieval layer, and tool execution are not yet
          wired in this build. Wiring lands progressively across Versions 3–7
          of the implementation roadmap. The cards above describe the trust
          model and surfaces the assistants will operate in.
        </p>
      </div>
    </div>
  );
}
