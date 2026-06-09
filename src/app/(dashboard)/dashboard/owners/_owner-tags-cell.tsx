"use client";

/**
 * Owners-list TAGS column cell.
 *
 * Renders an owner's CRM tags as compact Badge chips (Layer-B colour tokens —
 * no raw bg-black / inline style). Overflows past 3 collapse into a "+N" chip
 * so the table row never balloons. Empty → a muted em-dash.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";

type Tone = React.ComponentProps<typeof Badge>["tone"];

export interface OwnerRowTag {
  id: string;
  label: string;
  color: string;
}

function asTone(color: string): Tone {
  return (color as Tone) ?? "neutral";
}

const MAX_VISIBLE = 3;

export function OwnerTagsCell({ tags }: { tags: OwnerRowTag[] }) {
  if (tags.length === 0) {
    return <span className="text-ink-tertiary text-sm">—</span>;
  }
  const visible = tags.slice(0, MAX_VISIBLE);
  const overflow = tags.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
      {visible.map((t) => (
        <Badge key={t.id} tone={asTone(t.color)} className="normal-case">
          {t.label}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge
          tone="outline"
          className="normal-case"
          title={tags
            .slice(MAX_VISIBLE)
            .map((t) => t.label)
            .join(", ")}
        >
          +{overflow}
        </Badge>
      )}
    </div>
  );
}
