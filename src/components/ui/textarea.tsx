import * as React from "react";
import { cn } from "@/lib/utils";

/** foundations/01 PR2 — `.textarea` primitive (chrome.css Forms). */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("textarea", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";
