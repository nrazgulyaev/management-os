import * as React from "react";
import { Container } from "@/components/ui/section";
import { cn } from "@/lib/utils";

/**
 * Light wrapper used by Development OS pages to keep horizontal rhythm
 * consistent. The dashboard sidebar/topbar already comes from
 * `(dashboard)/layout.tsx`, so this only handles content padding.
 */
export function DevelopmentShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-10", className)}>{children}</div>
  );
}

export function DevelopmentPublicShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Container size="wide" className={cn("flex flex-col gap-24 py-12", className)}>
      {children}
    </Container>
  );
}
