import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-ink-secondary",
        accent: "bg-accent-weak text-accent",
        gold: "bg-gold-weak text-gold",
        success: "bg-success-weak text-success",
        warning: "bg-warning-weak text-warning",
        danger: "bg-danger-weak text-danger",
        info: "bg-info-weak text-info",
        outline: "border border-line-soft text-ink-secondary bg-transparent",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
