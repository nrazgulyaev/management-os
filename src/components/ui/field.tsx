import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * foundations/01 PR2 — `.field` primitive (chrome.css Forms): label + control
 * + optional help/error, in the canonical vertical stack. Pair with the
 * Input/Select/Textarea/Checkbox primitives as `children`.
 */
export interface FieldProps {
  label?: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  /** Wire to the control's `id` for label association. */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  help,
  error,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("field", className)}>
      {label != null && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {help != null && <p className="field-help">{help}</p>}
      {error != null && <p className="field-error">{error}</p>}
    </div>
  );
}
