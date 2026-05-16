"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sprint _handoff/ Task 5 — sidebar link active-state island.
 *
 * Tiny client component that wraps each nav row. Reads
 * `usePathname()` once per render and applies the `.on` class when
 * the link is active. Keeping this narrow means the bulk of the
 * sidebar (group containers, workspace tile, brand block) stays
 * server-rendered.
 *
 * Hard constraint 5.7 says "Sidebar must be Server Component" — the
 * outer `DashboardSidebar` honours that; this leaf is the only
 * hydration surface, which matches the App Router pattern Next.js
 * itself recommends for active-link highlighting.
 */
export function ActiveSidebarLink({
  href,
  children,
  exactOnly = false,
}: {
  href: string;
  children: React.ReactNode;
  /** Set true for the Overview link — pathname must equal href
   *  exactly. Otherwise `/dashboard/bookings` would always match
   *  `/dashboard`'s Overview row too. */
  exactOnly?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const active = exactOnly
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={"sb-item" + (active ? " on" : "")}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
