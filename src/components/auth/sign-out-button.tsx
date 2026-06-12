"use client";

/**
 * Shared Sign-out control. Wraps the existing signOutAction (clears the
 * Supabase session cookie origin-aware for .arconique.com and redirects to
 * /login). Mountable in every product shell. `icon` = round icon button (top
 * bars); `item` = full-width labelled row (sidebars / menus).
 */

import { LogOut } from "lucide-react";
import { signOutAction } from "@/features/auth/actions";

export function SignOutButton({
  variant = "icon",
  className,
  label = "Sign out",
}: {
  variant?: "icon" | "item";
  className?: string;
  label?: string;
}) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className={
          className ??
          (variant === "icon"
            ? "h-9 w-9 rounded-full border border-line-soft bg-surface hover:bg-muted inline-flex items-center justify-center text-ink-secondary transition-colors"
            : "flex items-center gap-2 w-full px-3 py-2 rounded-sm text-sm text-ink-secondary hover:bg-muted hover:text-ink transition-colors")
        }
      >
        <LogOut className="w-4 h-4" strokeWidth={1.75} />
        {variant === "item" && <span>{label}</span>}
      </button>
    </form>
  );
}
