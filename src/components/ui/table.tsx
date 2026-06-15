import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared table primitives — now rendered as the handoff design-system
 * `table.data` inside a `.card` shell. The visual styling (th/td padding,
 * borders, hover, the `.num` numeric column, the `.row-title` serif primary
 * cell) all comes from the product-scoped `table.data` CSS in
 * `src/styles/components/primitives.css`, so a single component renders the
 * mock-matched table under any `[data-product]` (mgmt / dev / …).
 *
 * The sub-components stay thin wrappers that pass `className` through, so the
 * ~107 callsites keep their per-column overrides (e.g. `className="num"` or a
 * width utility) without any JSX changes.
 */

export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className={cn("data w-full", className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  // `table.data th` CSS supplies the uppercase mono label + alignment; the
  // `.num` class right-aligns numeric headers. className still passes through.
  return <th scope="col" className={className} {...props} />;
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className} {...props} />;
}

export function TDNum({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  // `.num` = the design-system numeric cell (tabular mono, right-aligned).
  return <TD className={cn("num", className)} {...props} />;
}
