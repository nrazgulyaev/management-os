import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * foundations/01 PR2 — `.input` primitive (chrome.css Forms). Thin wrapper:
 * applies the token-driven `.input` class, forwards every native prop + ref.
 * Must render under a `[data-product]` ancestor for the palette to resolve.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("input", className)} {...props} />
  ),
);
Input.displayName = "Input";
