import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Bell,
  MessageSquare,
  ShieldCheck,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "Settings · Development OS" };
export const dynamic = "force-dynamic";

const SETTINGS_CARDS = [
  {
    href: "/development-os/settings/ai-usage",
    Icon: Sparkles,
    name: "AI usage",
    description:
      "Per-agent token + cost budgets, daily caps, current usage across translation / sales-assistant / construction-supervisor agents.",
  },
  {
    href: "/development-os/settings/notifications",
    Icon: Bell,
    name: "Notifications",
    description:
      "Notification rules, channels, digest schedule, and per-rule routing.",
  },
  {
    href: "/development-os/settings/whatsapp",
    Icon: MessageSquare,
    name: "WhatsApp setup",
    description:
      "Twilio phone numbers, template approval state, recipient management.",
  },
  {
    href: "/development-os/settings/approval-thresholds",
    Icon: ShieldCheck,
    name: "Approval thresholds",
    description:
      "Per-amount-tier role matrix used by procurement + change orders. Defense-in-depth: re-checked at every approve action.",
  },
  {
    href: "/development-os/finance/tax-types",
    Icon: Percent,
    name: "Tax types",
    description:
      "Operator-configurable tax type catalog (PPN, PPh23, lease tax, corporate income, etc.) — used by the per-transaction classification flow.",
  },
];

export default async function SettingsIndexPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span>
          </div>
          <h1>Settings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Operator-configurable knobs across the Development OS workspace.
            Each section below opens a dedicated configuration page.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Configuration</div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SETTINGS_CARDS.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="block rounded-lg border border-line-soft bg-surface p-5 hover:shadow-sm transition"
              >
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <c.Icon
                      className="w-5 h-5 text-ink-secondary"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-ink">{c.name}</h4>
                    <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                      {c.description}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </DevelopmentShell>
  );
}
