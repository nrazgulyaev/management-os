import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function GuestShell({
  children,
  villaName,
  dates,
}: {
  children: React.ReactNode;
  villaName?: string;
  dates?: string;
}) {
  return (
    // data-product="management" scopes the guest/concierge component CSS
    // (concierge.css + table.guests live under [data-product="management"]
    // and the cream/stone/ink token palette). The guest stay surface is
    // served on the management host (/stay is a management allowed-prefix in
    // middleware.ts), so this nested scope mirrors the owner-shell pattern
    // and activates the DS chrome the guest pages render against.
    <div data-product="management" className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-canvas/90 backdrop-blur">
        <div className="max-w-[720px] mx-auto flex items-center justify-between px-5 md:px-6 h-14">
          <Logo />
          {villaName && (
            <div className="hidden sm:flex flex-col text-right leading-tight">
              <span className="text-sm text-ink">{villaName}</span>
              {dates && (
                <span className="text-[11px] text-ink-tertiary">{dates}</span>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="max-w-[720px] mx-auto px-5 md:px-6 py-6 pb-28">
        {children}
      </main>
      <div className="fixed bottom-5 inset-x-0 flex justify-center z-30 pointer-events-none px-5">
        <Button
          asChild
          variant="primary"
          size="lg"
          className="pointer-events-auto rounded-full shadow-[var(--shadow-floating)]"
        >
          <Link href="#concierge">
            <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
            Concierge
          </Link>
        </Button>
      </div>
    </div>
  );
}
