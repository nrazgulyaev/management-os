import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-md border border-dashed border-line-soft bg-muted/30 px-8 py-14",
        className
      )}
    >
      {icon && (
        <div className="mb-4 w-10 h-10 rounded-full bg-surface flex items-center justify-center border border-line-soft text-ink-tertiary">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-ink mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-ink-secondary max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
