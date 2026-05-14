/**
 * Phase 1 — PhotoEvidenceGrid primitive.
 *
 * Mobile-first thumbnail grid with sync status per photo, used by
 * Site Supervisor (site reports), Housekeeping (turnover photos),
 * and Damage Reports.
 *
 * Each item carries a `status: uploaded | syncing | failed | local`
 * indicator badge on the corner. Clicking opens the full-size photo
 * (the consumer wires the modal). Empty state via `<EmptyState>`.
 *
 * Server component shell — no client state. The consumer manages
 * upload pipelines via the existing `<PhotoCapture>` primitive and
 * passes the resulting items in.
 */

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PhotoEvidenceStatus =
  | "uploaded"
  | "syncing"
  | "failed"
  | "local";

const STATUS_STYLE: Record<
  PhotoEvidenceStatus,
  { dotCls: string; tone: string; label: string }
> = {
  uploaded: {
    dotCls: "bg-success text-ink-inverse",
    tone: "text-success",
    label: "Uploaded",
  },
  syncing: {
    dotCls: "bg-info text-ink-inverse animate-pulse",
    tone: "text-info",
    label: "Syncing",
  },
  failed: {
    dotCls: "bg-danger text-ink-inverse",
    tone: "text-danger",
    label: "Failed",
  },
  local: {
    dotCls: "bg-warning text-ink-inverse",
    tone: "text-warning",
    label: "Local only",
  },
};

const STATUS_ICON: Record<PhotoEvidenceStatus, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  uploaded: CheckCircle2,
  syncing: Loader2,
  failed: AlertCircle,
  local: Cloud,
};

export interface PhotoEvidenceItem {
  id: string;
  /** URL of the thumbnail (small image). Required. */
  thumbnailUrl: string;
  /** Optional full-resolution URL (consumer's lightbox uses this). */
  fullUrl?: string;
  status: PhotoEvidenceStatus;
  /** Optional caption rendered under the thumbnail. */
  caption?: string;
  /** Optional timestamp shown on hover / in alt text. */
  timestamp?: string;
  /** Optional href — when set, the tile is a Link instead of a div. */
  href?: string;
  /** Alt text for accessibility. */
  alt?: string;
}

export interface PhotoEvidenceGridProps {
  items: PhotoEvidenceItem[];
  /** Optional heading above the grid. */
  heading?: React.ReactNode;
  /** Optional accessory in the header (e.g. "Add photo" button). */
  accessory?: React.ReactNode;
  /** Empty-state copy. */
  emptyMessage?: string;
  /** Grid columns at the largest breakpoint. Defaults to 4. */
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}

export function PhotoEvidenceGrid({
  items,
  heading,
  accessory,
  emptyMessage,
  columns = 4,
  className,
}: PhotoEvidenceGridProps) {
  const colsCls =
    columns === 5
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      : columns === 4
        ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
        : columns === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : "grid-cols-2";
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden",
        className,
      )}
      data-stage10="photo-evidence-grid"
    >
      {(heading || accessory) && (
        <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
          {heading ? (
            typeof heading === "string" ? (
              <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
                {heading}
              </h3>
            ) : (
              heading
            )
          ) : (
            <span />
          )}
          {accessory && <div className="shrink-0">{accessory}</div>}
        </header>
      )}
      {items.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-tertiary text-center">
          {emptyMessage ?? "No photos yet."}
        </p>
      ) : (
        <ul
          className={cn(
            "grid gap-2 md:gap-3 px-3 md:px-4 py-3 md:py-4",
            colsCls,
          )}
        >
          {items.map((item) => (
            <li key={item.id} className="relative">
              <PhotoTile item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PhotoTile({ item }: { item: PhotoEvidenceItem }) {
  const style = STATUS_STYLE[item.status];
  const Icon = STATUS_ICON[item.status];
  const body = (
    <div className="relative rounded-2xl overflow-hidden bg-canvas aspect-square">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbnailUrl}
        alt={item.alt ?? item.caption ?? "Photo evidence"}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <span
        className={cn(
          "absolute top-1.5 right-1.5 w-6 h-6 rounded-full inline-flex items-center justify-center",
          style.dotCls,
        )}
        title={`${style.label}${item.timestamp ? ` · ${item.timestamp}` : ""}`}
      >
        <Icon
          className={cn(
            "w-3.5 h-3.5",
            item.status === "syncing" && "animate-spin",
          )}
          strokeWidth={2}
        />
      </span>
      {item.caption && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-ink/70 to-transparent px-2 py-1.5">
          <p className="text-[10px] text-ink-inverse leading-tight line-clamp-2 font-medium">
            {item.caption}
          </p>
        </div>
      )}
    </div>
  );
  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block focus:outline-none focus:ring-2 focus:ring-line-strong rounded-2xl"
      >
        {body}
      </Link>
    );
  }
  return body;
}
