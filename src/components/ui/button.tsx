import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-strong",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-ink-inverse hover:bg-ink/90 active:translate-y-[1px]",
        accent:
          "bg-accent text-accent-contrast hover:opacity-90 active:translate-y-[1px]",
        secondary:
          "border border-line-soft bg-surface text-ink hover:bg-muted",
        ghost: "text-ink hover:bg-muted",
        subtle: "bg-muted text-ink hover:bg-inset",
        destructive: "bg-danger text-white hover:opacity-90",
        link: "text-ink underline underline-offset-4 hover:text-accent p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
