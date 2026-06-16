"use client";

import { useState } from "react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { updateStatementSettingsAction } from "@/features/finance/statement-settings-actions";
import type { StatementSettings } from "@/features/finance/statement-settings";

const MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "off", label: "Off — never include" },
  { value: "ledger", label: "Ledger — read posted finance lines" },
  { value: "formula", label: "Formula — compute % of gross" },
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

export function StatementSettingsForm({
  settings,
  readOnly = false,
}: {
  settings: StatementSettings;
  readOnly?: boolean;
}) {
  const { state, submitAction } = useModalOrRouteForm(
    updateStatementSettingsAction,
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const saved = state && state.ok;

  const [taxMode, setTaxMode] = useState(settings.taxMode);
  const [reserveMode, setReserveMode] = useState(settings.reserveMode);

  return (
    <form action={submitAction}>
      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <FormShell
          title="Statement settings"
          description="Drives the canonical owner-statement generator. Changes apply to the next statement generated."
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

          {/* Included sections */}
          <div className="flex flex-col gap-3">
            <span className="text-label">Included sections</span>
            <Toggle
              name="includeFees"
              label="Include fees"
              hint="OTA commission, payment processing, bank and FX fees on the statement."
              defaultChecked={settings.includeFees}
              disabled={readOnly}
            />
            <Toggle
              name="includeExpenses"
              label="Include expenses"
              hint="Owner-chargeable villa + shared pool expenses (and their allocations)."
              defaultChecked={settings.includeExpenses}
              disabled={readOnly}
            />
            <Toggle
              name="includeManagementFee"
              label="Include management fee"
              hint="The management-fee line (recorded lines or the synthetic fee-rule)."
              defaultChecked={settings.includeManagementFee}
              disabled={readOnly}
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
                onChange={(e) => setTaxMode(e.target.value as StatementSettings["taxMode"])}
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
                  defaultValue={settings.taxPct}
                  className={inputCls}
                />
              </Field>
            )}
            {/* Keep taxPct submitted even when hidden, so the value persists. */}
            {taxMode !== "formula" && (
              <input type="hidden" name="taxPct" value={settings.taxPct} />
            )}
            <Field
              label="Tax label"
              hint="Shown as the description on the tax statement line."
              error={errs.taxLabel?.[0]}
            >
              <input
                type="text"
                name="taxLabel"
                defaultValue={settings.taxLabel}
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
                onChange={(e) =>
                  setReserveMode(e.target.value as StatementSettings["reserveMode"])
                }
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
                  defaultValue={settings.reservePct}
                  className={inputCls}
                />
              </Field>
            )}
            {reserveMode !== "formula" && (
              <input type="hidden" name="reservePct" value={settings.reservePct} />
            )}
            <Field
              label="Reserve label"
              hint="Shown as the description on the reserve statement line."
              error={errs.reserveLabel?.[0]}
            >
              <input
                type="text"
                name="reserveLabel"
                defaultValue={settings.reserveLabel}
                maxLength={60}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Management fee */}
          <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
            <span className="text-label">Management fee</span>
            <Field
              label="Management fee label"
              hint="Prefixes the management-fee line description on the statement."
              error={errs.mgmtLabel?.[0]}
            >
              <input
                type="text"
                name="mgmtLabel"
                defaultValue={settings.mgmtLabel}
                maxLength={60}
                className={inputCls}
              />
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
                defaultValue={settings.statementCurrency}
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
        </FormShell>
      </fieldset>
    </form>
  );
}
