"use client";

import * as React from "react";
import { Field, inputCls } from "@/components/admin/form-shell";
import { parseMoneyToMinor } from "@/lib/money";

/**
 * UI input for a money amount. Accepts a free-form major-unit string
 * ("123.45" / "1 234,56" / "$1,234.56") and emits a hidden BIGINT minor
 * field named `<name>` so the server action can parse it as `bigint`.
 */
export function MoneyInput({
  label,
  name,
  required,
  defaultValue,
  hint,
  error,
  currency = "USD",
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: number | bigint | null;
  hint?: string;
  error?: string;
  currency?: string;
}) {
  const initialMajor =
    defaultValue === undefined || defaultValue === null
      ? ""
      : (Number(defaultValue) / 100).toFixed(2);
  const [display, setDisplay] = React.useState(initialMajor);
  const [minor, setMinor] = React.useState(() => {
    if (initialMajor === "") return "";
    try {
      return parseMoneyToMinor(initialMajor).toString();
    } catch {
      return "";
    }
  });

  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <div className="flex items-stretch gap-2">
        <span className="px-3 inline-flex items-center text-xs font-mono text-ink-tertiary border border-line-soft rounded-sm bg-muted">
          {currency.toUpperCase()}
        </span>
        <input
          inputMode="decimal"
          required={required}
          value={display}
          placeholder="0.00"
          onChange={(e) => {
            const v = e.target.value;
            setDisplay(v);
            try {
              setMinor(parseMoneyToMinor(v).toString());
            } catch {
              setMinor("");
            }
          }}
          className={`${inputCls} flex-1 font-mono tabular-nums`}
        />
      </div>
      <input type="hidden" name={name} value={minor} />
    </Field>
  );
}
