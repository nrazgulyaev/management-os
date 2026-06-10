"use client";

import * as React from "react";
import { validateNpwp, NPWP_FORMAT_HINT } from "@/lib/tax/npwp";

/**
 * ID-TAX compliance trio — soft NPWP validation for vendor forms.
 *
 * Drop-in replacement for the bare taxId <input>:
 *   * empty stays allowed (NPWP remains optional);
 *   * a present-but-malformed value renders an inline "Invalid NPWP
 *     format" error AND blocks submission via setCustomValidity — works
 *     for both client-handled and server-action <form action={…}> forms,
 *     because React form actions still run native constraint validation.
 *
 * Format-only validation (see src/lib/tax/npwp.ts) — no check-digit or
 * DJP-registration claim is made.
 */

export function NpwpInput({
  name = "taxId",
  defaultValue,
  placeholder = "01.234.567.8-901.000",
  className,
  ariaLabel,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [error, setError] = React.useState<string | null>(null);

  function check(el: HTMLInputElement) {
    const value = el.value.trim();
    if (value.length === 0) {
      // Optional field — empty must never block submit.
      el.setCustomValidity("");
      setError(null);
      return;
    }
    const result = validateNpwp(value);
    if (result.valid) {
      el.setCustomValidity("");
      setError(null);
      return;
    }
    const message = `Invalid NPWP format — enter a ${NPWP_FORMAT_HINT}, or leave blank.`;
    el.setCustomValidity(message);
    setError(message);
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={error !== null || undefined}
        data-testid="npwp-input"
        className={className}
        onChange={(e) => check(e.currentTarget)}
        onBlur={(e) => check(e.currentTarget)}
      />
      {error && (
        <span className="text-xs text-danger" data-testid="npwp-error">
          {error}
        </span>
      )}
    </div>
  );
}
