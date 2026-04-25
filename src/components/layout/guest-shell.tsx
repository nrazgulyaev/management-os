import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
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
    <div className="min-h-screen bg-canvas">
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
        <Link
          href="#concierge"
          className="pointer-events-auto inline-flex items-center gap-2 px-5 h-12 rounded-full bg-ink text-ink-inverse text-sm shadow-[var(--shadow-floating)] hover:bg-ink/90 transition-colors"
        >
          <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
          Concierge
        </Link>
      </div>
    </div>
  );
}
