import * as React from "react";
import { cn } from "@/lib/utils";

export function FormShell({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-surface border border-line-soft", className)}>
      {(title || description) && (
        <div className="px-6 md:px-8 pt-6 pb-5 border-b border-line-soft">
          {title && <h3 className="text-base font-medium text-ink">{title}</h3>}
          {description && (
            <p className="text-sm text-ink-secondary mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="px-6 md:px-8 py-6 flex flex-col gap-5">{children}</div>
      {footer && (
        <div className="px-6 md:px-8 py-4 border-t border-line-soft flex items-center justify-end gap-3 bg-muted/30">
          {footer}
        </div>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-label">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="text-[11px] text-ink-tertiary">{hint}</span>
      )}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </label>
  );
}

export const inputCls =
  "h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong transition-colors";

export const selectCls = inputCls;

export const textareaCls =
  "px-3 py-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong transition-colors resize-none";
