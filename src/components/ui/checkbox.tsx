import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * foundations/01 PR2 — `.check` primitive (chrome.css Forms). The styled box
 * is a sibling `<span class="box">` directly after the native input (the CSS
 * uses `input:checked + .box`). `className` lands on the wrapping label; all
 * native input props + ref forward to the `<input>`.
 */
export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => (
    <label className={cn("check", className)}>
      <input ref={ref} type="checkbox" {...props} />
      <span className="box" aria-hidden />
      {label}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";
