"use client";

/**
 * CRM-CUSTOM-FIELDS-TAGS — owner-list tag filter strip.
 *
 * Renders the org's tag vocabulary as toggle chips. Selecting one sets the
 * `?tag=<id>` searchParam (server re-filters the list); selecting it again or
 * "All" clears it. Pure navigation — no client state, just links — so the
 * filtered list is bookmarkable and SSR-rendered.
 */

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Tone = React.ComponentProps<typeof Badge>["tone"];

export function OwnerTagFilter({
  tags,
  activeTagId,
}: {
  tags: { id: string; label: string; color: string }[];
  activeTagId: string | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(tagId: string | null): string {
    const next = new URLSearchParams(params.toString());
    if (tagId) next.set("tag", tagId);
    else next.delete("tag");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3 mb-1">
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary mr-1">
        Filter by tag
      </span>
      <Link
        href={hrefFor(null)}
        className="inline-flex"
        aria-current={!activeTagId ? "true" : undefined}
      >
        <Badge
          tone={!activeTagId ? "accent" : "outline"}
          className="normal-case cursor-pointer hover:opacity-80 transition-opacity"
        >
          All
        </Badge>
      </Link>
      {tags.map((t) => {
        const active = t.id === activeTagId;
        return (
          <Link
            key={t.id}
            href={hrefFor(active ? null : t.id)}
            className="inline-flex"
            aria-current={active ? "true" : undefined}
          >
            <Badge
              tone={(active ? t.color : "outline") as Tone}
              className={
                "normal-case cursor-pointer transition-opacity " +
                (active ? "ring-1 ring-ink/20" : "hover:opacity-80")
              }
            >
              {t.label}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
