import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listReconciliationRulesForUi } from "@/lib/banking/queries";
import {
  createRuleAction,
  setRuleActiveAction,
} from "@/lib/banking/bookkeeper-actions";

export const metadata: Metadata = { title: "Reconciliation rules · Finance" };
export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Rules" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const rules = await listReconciliationRulesForUi();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Rules" },
        ]}
        eyebrow={`${rules.length} rules`}
        title="Reconciliation rules"
        description="Operator-defined rules fire on import (before the auto-matcher) and assign categories / vendors / invoice-match strategies. Lower priority number = higher precedence; first matching rule per action wins."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/bank-review">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Bank review
            </Link>
          </Button>
        }
      />

      <Section
        title="Create rule"
        description='matchConfig is JSON. Examples: description_contains -> {"needle":"Stripe"}; amount_range -> {"minMinor":-10000,"maxMinor":10000}; description_regex -> {"pattern":"^INV-\\\\d+","flags":"i"}.'
      >
        <form
          action={createRuleAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-line-soft bg-surface p-3 text-sm"
          data-testid="reconciliation-rule-create-form"
        >
          <Field label="Name">
            <input
              type="text"
              name="name"
              required
              placeholder="Auto-categorize Stripe payouts"
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <input type="text" name="description" className={inputCls} />
          </Field>
          <Field label="Match type">
            <select name="matchType" required className={inputCls}>
              <option value="description_contains">description_contains</option>
              <option value="description_regex">description_regex</option>
              <option value="counterparty_match">counterparty_match</option>
              <option value="amount_exact">amount_exact</option>
              <option value="amount_range">amount_range</option>
              <option value="date_range_match">date_range_match</option>
            </select>
          </Field>
          <Field label="Priority (lower = higher)">
            <input
              type="number"
              name="priority"
              defaultValue={100}
              className={inputCls}
            />
          </Field>
          <Field label="Match config (JSON)" className="md:col-span-2">
            <textarea
              name="matchConfig"
              required
              rows={3}
              placeholder='{"needle":"Stripe"}'
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="Auto-assign category id (optional)">
            <input
              type="text"
              name="autoAssignCategoryId"
              placeholder="UUID"
              className={inputCls}
            />
          </Field>
          <Field label="Auto-match vendor id (optional)">
            <input
              type="text"
              name="autoMatchToVendorId"
              placeholder="UUID"
              className={inputCls}
            />
          </Field>
          <Field label="Invoice match strategy (optional)">
            <select name="autoMatchToInvoiceStrategy" className={inputCls}>
              <option value="">(none)</option>
              <option value="amount_only">amount_only</option>
              <option value="amount_and_date">amount_and_date</option>
              <option value="amount_date_vendor">amount_date_vendor</option>
              <option value="fuzzy_description">fuzzy_description</option>
            </select>
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="primary">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Create rule
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Existing rules">
        {rules.length === 0 ? (
          <EmptyState
            title="No rules configured"
            description="Create your first rule above."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Match</TH>
                <TH className="text-right">Priority</TH>
                <TH className="text-right">Triggered</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => {
                const toggleBound = setRuleActiveAction.bind(
                  null,
                  r.id,
                  !r.isActive,
                );
                return (
                  <TR key={r.id}>
                    <TD>{r.name}</TD>
                    <TD className="text-xs font-mono">{r.matchType}</TD>
                    <TD className="text-right tabular-nums">{r.priority}</TD>
                    <TD className="text-right tabular-nums">{r.matchCount}</TD>
                    <TD>
                      <Badge tone={r.isActive ? "success" : "neutral"}>
                        {r.isActive ? "active" : "paused"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <form action={toggleBound}>
                        <Button type="submit" variant="secondary" size="sm">
                          {r.isActive ? "Pause" : "Activate"}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-ink-secondary text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
