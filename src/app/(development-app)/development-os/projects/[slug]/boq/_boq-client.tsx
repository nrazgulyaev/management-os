"use client";

/**
 * Phase 2.2 dev-03 — BOQ workspace (client).
 *
 * Hosts the WP tree filter state alongside the virtualized table.
 * The line detail link drops the user into
 * `/projects/[slug]/boq/[lineId]`.
 */

import * as React from "react";
import { WpTree, type WpNode } from "@/components/boq/wp-tree";
import { BoqTable, type BoqTableLine } from "@/components/boq/boq-table";

export interface BoqWorkspaceProps {
  nodes: WpNode[];
  lines: BoqTableLine[];
}

export function BoqWorkspace({ nodes, lines }: BoqWorkspaceProps) {
  const [selected, setSelected] = React.useState<string | null>(null);
  return (
    <div className="boq-workspace">
      <WpTree nodes={nodes} selected={selected} onSelect={setSelected} />
      <BoqTable lines={lines} wpFilter={selected} />
    </div>
  );
}
