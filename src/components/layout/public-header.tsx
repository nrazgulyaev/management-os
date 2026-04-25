"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { marketingNav } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b transition-colors duration-300",
        scrolled
          ? "border-line-soft bg-canvas/85 backdrop-blur-md"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-8 h-16">
        <Logo />
        <nav className="hidden lg:flex items-center gap-1">
          {marketingNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-3 py-2 text-sm transition-colors rounded-sm",
                  active
                    ? "text-ink"
                    : "text-ink-secondary hover:text-ink"
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[1px] h-px bg-ink" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" variant="primary">
            <Link href="/contact">Apply</Link>
          </Button>
        </div>
        <button
          className="lg:hidden p-2 text-ink"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-line-soft bg-canvas">
          <nav className="flex flex-col py-2">
            {marketingNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-6 py-3 text-sm text-ink hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-line-soft mt-2 p-4 flex gap-2">
              <Button asChild variant="secondary" size="sm" className="flex-1">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link href="/contact">Apply</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
