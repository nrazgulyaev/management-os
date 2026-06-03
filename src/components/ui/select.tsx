import * as React from "react";
import { cn } from "@/lib/utils";

/** foundations/01 PR2 — `.select` primitive (chrome.css Forms). */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("select", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";
