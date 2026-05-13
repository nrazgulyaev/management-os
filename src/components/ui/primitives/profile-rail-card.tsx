/**
 * Sprint 1 — ProfileRailCard primitive.
 *
 * Pattern from the doctor / candidate-management reference dashboards:
 * a tall card on the right of the hero row showing the current
 * operator's identity (avatar with emerald gradient ring, name, role,
 * org chip) plus a small "active items" rail of avatar+label pills.
 *
 * Reuses the gradient ring treatment from `<CabinetGreetingBlock>` so
 * avatars feel consistent across the product.
 *
 * Server component — no hooks.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProfileUser {
  name: string;
  role?: string;
  /** URL or path for the avatar image. If absent, initials render. */
  avatarUrl?: string;
}

export interface ProfileOrg {
  name: string;
  code?: string;
}

export interface ProfileRailItem {
  /** Avatar URL / hero image / icon URL. If absent, label initials render. */
  avatar?: string;
  label: string;
  /** Optional sub-label (e.g. "84% occupancy"). */
  sublabel?: string;
  href?: string;
}

export interface ProfileRailCardProps {
  user: ProfileUser;
  org?: ProfileOrg;
  /** Header label for the items rail. Defaults to "Active". */
  itemsHeading?: string;
  items?: ProfileRailItem[];
  /** Optional accessory rendered at the bottom of the card. */
  accessory?: React.ReactNode;
  className?: string;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileRailCard({
  user,
  org,
  itemsHeading = "Active",
  items,
  accessory,
  className,
}: ProfileRailCardProps) {
  return (
    <aside
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 flex flex-col gap-5",
        className,
      )}
      data-stage10="profile-rail-card"
    >
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="shrink-0 rounded-full p-[2px] bg-gradient-to-br from-accent via-accent-weak to-gold-weak">
          <div className="rounded-full bg-canvas p-[2px]">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="block rounded-full w-16 h-16 object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-ink font-medium text-lg">
                {initials(user.name) || "·"}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-ink font-medium text-base leading-tight truncate">
            {user.name}
          </p>
          {user.role && (
            <p className="text-xs text-ink-tertiary uppercase tracking-[0.14em]">
              {user.role}
            </p>
          )}
        </div>
        {org && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-weak text-accent px-3 py-1 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {org.name}
            {org.code && (
              <span className="text-accent/70 font-mono">· {org.code}</span>
            )}
          </span>
        )}
      </header>

      {items && items.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
            {itemsHeading}
          </span>
          <ul className="flex flex-col gap-1.5">
            {items.map((item, idx) => {
              const body = (
                <span className="flex items-center gap-2.5 min-w-0">
                  {item.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.avatar}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-ink-secondary shrink-0">
                      {initials(item.label) || "·"}
                    </span>
                  )}
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm text-ink truncate">
                      {item.label}
                    </span>
                    {item.sublabel && (
                      <span className="text-[11px] text-ink-tertiary tabular-nums truncate">
                        {item.sublabel}
                      </span>
                    )}
                  </span>
                </span>
              );
              return (
                <li key={`${item.label}-${idx}`} className="flex items-center">
                  {item.href ? (
                    <a
                      href={item.href}
                      className="flex-1 -mx-2 px-2 py-1 rounded-md hover:bg-muted transition-colors"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="flex-1 py-1">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {accessory && (
        <div className="border-t border-line-soft pt-4">{accessory}</div>
      )}
    </aside>
  );
}
