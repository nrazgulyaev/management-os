"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil } from "lucide-react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  ModalFirstAddButton,
  type ModalFirstFormProps,
} from "@/components/ui/primitives/modal-first-add-button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import {
  updateStatementSettingsAction,
  deleteStatementSettingsOverrideAction,
  createStatementCustomDeductionAction,
  updateStatementCustomDeductionAction,
  deleteStatementCustomDeductionAction,
} from "@/features/finance/statement-settings-actions";
import type { StatementSettings } from "@/features/finance/statement-settings";

// ---------------------------------------------------------------------------
// Shared types for the client (page.tsx serializes the DB rows into these).
// ---------------------------------------------------------------------------

interface ScopeOption {
  id: string;
  name: string;
}

/** A per-scope settings override row (every column the form edits). */
interface OverrideRow {
  id: string;
  projectId: string | null;
  ownerId: string | null;
  includeFees: boolean;
  includeExpenses: boolean;
  includeManagementFee: boolean;
  taxMode: string;
  taxPct: number;
  taxLabel: string;
  reserveMode: string;
  reservePct: number;
  reserveLabel: string;
  mgmtMode: string;
  mgmtPct: number;
  mgmtLabel: string;
  revenueSource: string;
  statementCurrency: string;
}

/** A custom-deduction row (fixedAmountMinor stringified across the boundary). */
interface DeductionRow {
  id: string;
  projectId: string | null;
  ownerId: string | null;
  label: string;
  mode: "formula" | "fixed";
  pct: number | null;
  fixedAmountMinor: string | null;
  sortOrder: number;
  active: boolean;
}

const MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "off", label: "Off — never include" },
  { value: "ledger", label: "Ledger — read posted finance lines" },
  { value: "formula", label: "Formula — compute % of gross" },
];

const REVENUE_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ledger", label: "Ledger — sum posted revenue lines" },
  { value: "bookings", label: "Bookings — derive from bookings + channel fees" },
];

const CURRENCY_OPTIONS = ["IDR", "USD", "EUR", "GBP", "AUD", "SGD"];

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        value="on"
        className="mt-0.5 h-4 w-4 rounded border-line-soft accent-ink"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-ink">{label}</span>
        <span className="text-[11px] text-ink-tertiary">{hint}</span>
      </span>
    </label>
  );
}

function asMode(value: string): StatementSettings["taxMode"] {
  return value === "off" || value === "formula" ? value : "ledger";
}

// ---------------------------------------------------------------------------
// SettingsFields — the full settings field group, shared by the org-default
// form AND the per-scope override modal. `errs` carries fieldErrors back.
// ---------------------------------------------------------------------------

interface SettingsValues {
  includeFees: boolean;
  includeExpenses: boolean;
  includeManagementFee: boolean;
  taxMode: string;
  taxPct: number;
  taxLabel: string;
  reserveMode: string;
  reservePct: number;
  reserveLabel: string;
  mgmtMode: string;
  mgmtPct: number;
  mgmtLabel: string;
  revenueSource: string;
  statementCurrency: string;
}

function SettingsFields({
  values,
  errs,
  disabled,
}: {
  values: SettingsValues;
  errs: Record<string, string[] | undefined>;
  disabled?: boolean;
}) {
  const [taxMode, setTaxMode] = useState(values.taxMode);
  const [reserveMode, setReserveMode] = useState(values.reserveMode);
  const [mgmtMode, setMgmtMode] = useState(values.mgmtMode);

  return (
    <>
      {/* Included sections */}
      <div className="flex flex-col gap-3">
        <span className="text-label">Included sections</span>
        <Toggle
          name="includeFees"
          label="Include fees"
          hint="OTA commission, payment processing, bank and FX fees on the statement."
          defaultChecked={values.includeFees}
          disabled={disabled}
        />
        <Toggle
          name="includeExpenses"
          label="Include expenses"
          hint="Owner-chargeable villa + shared pool expenses (and their allocations)."
          defaultChecked={values.includeExpenses}
          disabled={disabled}
        />
        <Toggle
          name="includeManagementFee"
          label="Include management fee"
          hint="The management-fee line (recorded lines or the synthetic fee-rule)."
          defaultChecked={values.includeManagementFee}
          disabled={disabled}
        />
      </div>

      {/* Tax */}
      <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
        <span className="text-label">Tax</span>
        <Field
          label="Tax mode"
          hint="Ledger reads posted tax lines. Formula computes a % of gross revenue (ignores the ledger). Off omits tax entirely."
        >
          <select
            name="taxMode"
            value={taxMode}
            onChange={(e) => setTaxMode(e.target.value)}
            className={selectCls}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {taxMode === "formula" && (
          <Field
            label="Tax percentage"
            hint="Percent of gross revenue (0–100). Applied only in Formula mode."
            error={errs.taxPct?.[0]}
          >
            <input
              type="number"
              name="taxPct"
              min={0}
              max={100}
              step="0.001"
              defaultValue={values.taxPct}
              className={inputCls}
            />
          </Field>
        )}
        {taxMode !== "formula" && (
          <input type="hidden" name="taxPct" value={values.taxPct} />
        )}
        <Field
          label="Tax label"
          hint="Shown as the description on the tax statement line."
          error={errs.taxLabel?.[0]}
        >
          <input
            type="text"
            name="taxLabel"
            defaultValue={values.taxLabel}
            maxLength={60}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Reserve */}
      <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
        <span className="text-label">Reserve</span>
        <Field
          label="Reserve mode"
          hint="Ledger reads posted reserve movements. Formula sets aside a % of gross revenue. Off omits reserve entirely."
        >
          <select
            name="reserveMode"
            value={reserveMode}
            onChange={(e) => setReserveMode(e.target.value)}
            className={selectCls}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {reserveMode === "formula" && (
          <Field
            label="Reserve percentage"
            hint="Percent of gross revenue (0–100) set aside. Applied only in Formula mode."
            error={errs.reservePct?.[0]}
          >
            <input
              type="number"
              name="reservePct"
              min={0}
              max={100}
              step="0.001"
              defaultValue={values.reservePct}
              className={inputCls}
            />
          </Field>
        )}
        {reserveMode !== "formula" && (
          <input type="hidden" name="reservePct" value={values.reservePct} />
        )}
        <Field
          label="Reserve label"
          hint="Shown as the description on the reserve statement line."
          error={errs.reserveLabel?.[0]}
        >
          <input
            type="text"
            name="reserveLabel"
            defaultValue={values.reserveLabel}
            maxLength={60}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Management fee */}
      <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
        <span className="text-label">Management fee</span>
        <Field
          label="Management-fee mode"
          hint="Ledger reads posted management-fee lines (today's behavior). Formula charges a % of gross revenue. Off suppresses the fee entirely."
        >
          <select
            name="mgmtMode"
            value={mgmtMode}
            onChange={(e) => setMgmtMode(e.target.value)}
            className={selectCls}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {mgmtMode === "formula" && (
          <Field
            label="Management-fee percentage"
            hint="Percent of gross revenue (0–100) charged as the management fee. Applied only in Formula mode."
            error={errs.mgmtPct?.[0]}
          >
            <input
              type="number"
              name="mgmtPct"
              min={0}
              max={100}
              step="0.001"
              defaultValue={values.mgmtPct}
              className={inputCls}
            />
          </Field>
        )}
        {mgmtMode !== "formula" && (
          <input type="hidden" name="mgmtPct" value={values.mgmtPct} />
        )}
        <Field
          label="Management fee label"
          hint="Prefixes the management-fee line description on the statement."
          error={errs.mgmtLabel?.[0]}
        >
          <input
            type="text"
            name="mgmtLabel"
            defaultValue={values.mgmtLabel}
            maxLength={60}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Revenue source */}
      <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
        <span className="text-label">Revenue source</span>
        <Field
          label="Gross revenue source"
          hint="ledger = sum your posted revenue_lines; bookings = derive from bookings + channel fees, like the monthly cron."
          error={errs.revenueSource?.[0]}
        >
          <select
            name="revenueSource"
            defaultValue={
              values.revenueSource === "bookings" ? "bookings" : "ledger"
            }
            className={selectCls}
          >
            {REVENUE_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Statement currency */}
      <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
        <span className="text-label">Statement currency</span>
        <Field
          label="Currency"
          hint="The currency every owner statement is denominated in (unless a caller forces one)."
          error={errs.statementCurrency?.[0]}
        >
          <select
            name="statementCurrency"
            defaultValue={values.statementCurrency}
            className={selectCls}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ORG-DEFAULT form (keeps #284's behavior; projectId/ownerId omitted → org row).
// ---------------------------------------------------------------------------

function OrgDefaultForm({
  settings,
  readOnly,
}: {
  settings: StatementSettings;
  readOnly: boolean;
}) {
  const { state, submitAction } = useModalOrRouteForm(
    updateStatementSettingsAction,
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const saved = state && state.ok;

  return (
    <form action={submitAction}>
      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <FormShell
          title="Organization default"
          description="The fallback for every owner statement. Project and owner overrides below take precedence."
          footer={
            !readOnly ? (
              <>
                {saved && (
                  <span className="text-sm text-success mr-auto">Saved.</span>
                )}
                <SubmitButton>Save settings</SubmitButton>
              </>
            ) : undefined
          }
        >
          {state && !state.ok && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {state.error}
            </div>
          )}
          <SettingsFields values={settings} errs={errs} disabled={readOnly} />
        </FormShell>
      </fieldset>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Per-scope OVERRIDE add/edit form (rendered inside ModalFirstAddButton). Posts
// updateStatementSettingsAction with projectId OR ownerId. A scope picker is
// shown only on create (editing keeps the row's scope fixed).
// ---------------------------------------------------------------------------

const OVERRIDE_DEFAULTS: SettingsValues = {
  includeFees: true,
  includeExpenses: true,
  includeManagementFee: true,
  taxMode: "ledger",
  taxPct: 11,
  taxLabel: "Tax",
  reserveMode: "ledger",
  reservePct: 3,
  reserveLabel: "Reserve",
  mgmtMode: "ledger",
  mgmtPct: 20,
  mgmtLabel: "Management fee",
  revenueSource: "ledger",
  statementCurrency: "IDR",
};

function OverrideForm({
  projects,
  owners,
  existing,
  onSuccess,
  onCancel,
}: ModalFirstFormProps & {
  projects: ScopeOption[];
  owners: ScopeOption[];
  existing?: OverrideRow;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm(
    updateStatementSettingsAction,
    { onSuccess },
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  // Scope target on CREATE: pick a project OR an owner. ("" = none.)
  const [scopeKind, setScopeKind] = useState<"project" | "owner">("project");
  const [scopeId, setScopeId] = useState("");

  const isEdit = !!existing;
  const values: SettingsValues = existing ?? OVERRIDE_DEFAULTS;

  return (
    <form action={submitAction} className="flex flex-col gap-6">
      {/* Fixed scope ids on submit. */}
      {isEdit ? (
        <>
          <input type="hidden" name="projectId" value={existing.projectId ?? ""} />
          <input type="hidden" name="ownerId" value={existing.ownerId ?? ""} />
        </>
      ) : (
        <>
          <input
            type="hidden"
            name="projectId"
            value={scopeKind === "project" ? scopeId : ""}
          />
          <input
            type="hidden"
            name="ownerId"
            value={scopeKind === "owner" ? scopeId : ""}
          />
        </>
      )}

      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {state.error}
        </div>
      )}

      {!isEdit && (
        <div className="flex flex-col gap-4">
          <Field
            label="Override scope"
            hint="An owner override beats a project override, which beats the org default."
          >
            <select
              value={scopeKind}
              onChange={(e) => {
                setScopeKind(e.target.value as "project" | "owner");
                setScopeId("");
              }}
              className={selectCls}
            >
              <option value="project">By project</option>
              <option value="owner">By owner</option>
            </select>
          </Field>
          <Field
            label={scopeKind === "project" ? "Project" : "Owner"}
            hint={`The ${scopeKind} this override applies to.`}
          >
            <select
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className={selectCls}
              required
            >
              <option value="">
                Select a {scopeKind}…
              </option>
              {(scopeKind === "project" ? projects : owners).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <SettingsFields values={values} errs={errs} />

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton disabled={pending || (!isEdit && !scopeId)}>
          {isEdit ? "Save override" : "Add override"}
        </SubmitButton>
      </div>
    </form>
  );
}

function OverridesSection({
  overrides,
  projects,
  owners,
  readOnly,
}: {
  overrides: OverrideRow[];
  projects: ScopeOption[];
  owners: ScopeOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<OverrideRow | null>(null);

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? "Unknown project";
  const ownerName = (id: string | null) =>
    owners.find((o) => o.id === id)?.name ?? "Unknown owner";

  function handleRemove(id: string) {
    if (readOnly) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteStatementSettingsOverrideAction(fd);
      router.refresh();
    });
  }

  return (
    <FormShell
      title="Per-project & per-owner overrides"
      description="A more-specific row wins wholesale: owner override > project override > org default."
      footer={
        !readOnly ? (
          <ModalFirstAddButton
            label="Add override"
            modalTitle="New statement-settings override"
            modalDescription="Pick a project or owner, then set the full settings for that scope."
            formComponent={OverrideForm}
            formProps={{ projects, owners }}
            size="lg"
          />
        ) : undefined
      }
    >
      {overrides.length === 0 ? (
        <p className="text-sm text-ink-tertiary">
          No overrides yet. Every statement uses the organization default above.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {overrides.map((o) => {
            const scopeLabel = o.ownerId
              ? `Owner · ${ownerName(o.ownerId)}`
              : `Project · ${projectName(o.projectId)}`;
            const summary = [
              `tax ${o.taxMode}${o.taxMode === "formula" ? ` ${o.taxPct}%` : ""}`,
              `reserve ${o.reserveMode}${o.reserveMode === "formula" ? ` ${o.reservePct}%` : ""}`,
              `mgmt ${o.mgmtMode}${o.mgmtMode === "formula" ? ` ${o.mgmtPct}%` : ""}`,
              `rev ${o.revenueSource}`,
              o.statementCurrency,
            ].join(" · ");
            return (
              <li
                key={o.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm text-ink font-medium truncate">
                    {scopeLabel}
                  </span>
                  <span className="text-[11px] text-ink-tertiary truncate">
                    {summary}
                  </span>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing(o)}
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleRemove(o.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditOverrideModal
          override={editing}
          projects={projects}
          owners={owners}
          onClose={() => setEditing(null)}
        />
      )}
    </FormShell>
  );
}

// Edit modal reuses OverrideForm in edit-mode inside an EntityModal dialog.
function EditOverrideModal({
  override,
  projects,
  owners,
  onClose,
}: {
  override: OverrideRow;
  projects: ScopeOption[];
  owners: ScopeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const scopeLabel = override.ownerId
    ? owners.find((o) => o.id === override.ownerId)?.name ?? "owner"
    : projects.find((p) => p.id === override.projectId)?.name ?? "project";
  return (
    <EntityModal
      open
      onClose={onClose}
      title="Edit override"
      description={`Settings for ${override.ownerId ? "owner" : "project"} · ${scopeLabel}.`}
      size="lg"
    >
      <div className="px-4 md:px-5 py-4">
        <OverrideForm
          projects={projects}
          owners={owners}
          existing={override}
          onSuccess={() => {
            onClose();
            router.refresh();
          }}
          onCancel={onClose}
        />
      </div>
    </EntityModal>
  );
}

// ---------------------------------------------------------------------------
// CUSTOM DEDUCTIONS — list / add / edit / remove org_statement_custom_deductions.
// ---------------------------------------------------------------------------

function DeductionForm({
  projects,
  owners,
  currency,
  existing,
  onSuccess,
  onCancel,
}: ModalFirstFormProps & {
  projects: ScopeOption[];
  owners: ScopeOption[];
  currency: string;
  existing?: DeductionRow;
}) {
  const isEdit = !!existing;
  const action = isEdit
    ? updateStatementCustomDeductionAction
    : createStatementCustomDeductionAction;
  const { state, submitAction, pending } = useModalOrRouteForm(action, {
    onSuccess,
  });
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  const [mode, setMode] = useState<"formula" | "fixed">(existing?.mode ?? "formula");
  const [scope, setScope] = useState<"org" | "project" | "owner">(
    existing?.ownerId ? "owner" : existing?.projectId ? "project" : "org",
  );
  const [scopeId, setScopeId] = useState(
    existing?.ownerId ?? existing?.projectId ?? "",
  );

  return (
    <form action={submitAction} className="flex flex-col gap-5">
      {isEdit && <input type="hidden" name="id" value={existing.id} />}
      <input
        type="hidden"
        name="projectId"
        value={scope === "project" ? scopeId : ""}
      />
      <input
        type="hidden"
        name="ownerId"
        value={scope === "owner" ? scopeId : ""}
      />

      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {state.error}
        </div>
      )}

      <Field label="Label" hint="Shown as the deduction line description." error={errs.label?.[0]}>
        <input
          type="text"
          name="label"
          defaultValue={existing?.label ?? ""}
          maxLength={80}
          required
          className={inputCls}
        />
      </Field>

      <Field
        label="Mode"
        hint="Formula deducts a % of gross revenue. Fixed deducts a flat amount."
        error={errs.mode?.[0]}
      >
        <select
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "formula" | "fixed")}
          className={selectCls}
        >
          <option value="formula">Formula — % of gross</option>
          <option value="fixed">Fixed — flat amount</option>
        </select>
      </Field>

      {mode === "formula" ? (
        <Field
          label="Percentage"
          hint="Percent of gross revenue (0–100)."
          error={errs.pct?.[0]}
        >
          <input
            type="number"
            name="pct"
            min={0}
            max={100}
            step="0.001"
            defaultValue={existing?.pct ?? ""}
            className={inputCls}
          />
        </Field>
      ) : (
        <MoneyInput
          label="Fixed amount"
          name="fixedAmountMinor"
          hint="Flat amount deducted each statement."
          currency={currency}
          defaultValue={
            existing?.fixedAmountMinor != null
              ? BigInt(existing.fixedAmountMinor)
              : null
          }
          error={errs.fixedAmountMinor?.[0]}
        />
      )}

      <Field
        label="Scope"
        hint="Owner deductions beat project deductions, which beat org-wide ones."
      >
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as "org" | "project" | "owner");
            setScopeId("");
          }}
          className={selectCls}
        >
          <option value="org">Organization-wide</option>
          <option value="project">A project</option>
          <option value="owner">An owner</option>
        </select>
      </Field>
      {scope !== "org" && (
        <Field label={scope === "project" ? "Project" : "Owner"}>
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className={selectCls}
            required
          >
            <option value="">Select a {scope}…</option>
            {(scope === "project" ? projects : owners).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Sort order" hint="Lower numbers list first." error={errs.sortOrder?.[0]}>
        <input
          type="number"
          name="sortOrder"
          min={0}
          max={9999}
          step={1}
          defaultValue={existing?.sortOrder ?? 0}
          className={inputCls}
        />
      </Field>

      <Toggle
        name="active"
        label="Active"
        hint="Inactive deductions are kept but skipped by the generator."
        defaultChecked={existing?.active ?? true}
      />

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton disabled={pending || (scope !== "org" && !scopeId)}>
          {isEdit ? "Save deduction" : "Add deduction"}
        </SubmitButton>
      </div>
    </form>
  );
}

function formatDeductionAmount(d: DeductionRow): string {
  if (d.mode === "formula") return d.pct != null ? `${d.pct}% of gross` : "—";
  if (d.fixedAmountMinor == null) return "—";
  return `${(Number(d.fixedAmountMinor) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} (fixed)`;
}

function DeductionsSection({
  deductions,
  projects,
  owners,
  currency,
  readOnly,
}: {
  deductions: DeductionRow[];
  projects: ScopeOption[];
  owners: ScopeOption[];
  currency: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<DeductionRow | null>(null);

  const scopeLabel = (d: DeductionRow): string => {
    if (d.ownerId)
      return `Owner · ${owners.find((o) => o.id === d.ownerId)?.name ?? "Unknown"}`;
    if (d.projectId)
      return `Project · ${projects.find((p) => p.id === d.projectId)?.name ?? "Unknown"}`;
    return "Organization-wide";
  };

  function handleRemove(id: string) {
    if (readOnly) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteStatementCustomDeductionAction(fd);
      router.refresh();
    });
  }

  return (
    <FormShell
      title="Custom deductions"
      description="Operator-defined extra deduction lines on the owner statement (e.g. Linen fee, Pool service). Each subtracts from net."
      footer={
        !readOnly ? (
          <ModalFirstAddButton
            label="Add deduction"
            modalTitle="New custom deduction"
            modalDescription="A formula (% of gross) or fixed amount, optionally scoped to a project or owner."
            formComponent={DeductionForm}
            formProps={{ projects, owners, currency }}
            size="lg"
          />
        ) : undefined
      }
    >
      {deductions.length === 0 ? (
        <p className="text-sm text-ink-tertiary">
          No custom deductions configured.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {deductions.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-4 py-3 first:pt-0"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm text-ink font-medium truncate">
                  {d.label}
                  {!d.active && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-tertiary">
                      inactive
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-ink-tertiary truncate">
                  {formatDeductionAmount(d)} · {scopeLabel(d)} · #{d.sortOrder}
                </span>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(d)}
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleRemove(d.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EntityModal
          open
          onClose={() => setEditing(null)}
          title="Edit custom deduction"
          size="lg"
        >
          <div className="px-4 md:px-5 py-4">
            <DeductionForm
              projects={projects}
              owners={owners}
              currency={currency}
              existing={editing}
              onSuccess={() => {
                setEditing(null);
                router.refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        </EntityModal>
      )}
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Top-level form export — composes the three sections.
// ---------------------------------------------------------------------------

export function StatementSettingsForm({
  settings,
  overrides,
  deductions,
  projects,
  owners,
  readOnly = false,
}: {
  settings: StatementSettings;
  overrides: OverrideRow[];
  deductions: DeductionRow[];
  projects: ScopeOption[];
  owners: ScopeOption[];
  readOnly?: boolean;
}) {
  // Normalize the org-default settings' string modes so SettingsFields' typed
  // state initializers are happy (they accept plain strings, but keep parity).
  const orgValues: StatementSettings = {
    ...settings,
    taxMode: asMode(settings.taxMode),
    reserveMode: asMode(settings.reserveMode),
    mgmtMode: asMode(settings.mgmtMode),
  };

  return (
    <div className="flex flex-col gap-8">
      <OrgDefaultForm settings={orgValues} readOnly={readOnly} />
      <OverridesSection
        overrides={overrides}
        projects={projects}
        owners={owners}
        readOnly={readOnly}
      />
      <DeductionsSection
        deductions={deductions}
        projects={projects}
        owners={owners}
        currency={orgValues.statementCurrency}
        readOnly={readOnly}
      />
    </div>
  );
}
