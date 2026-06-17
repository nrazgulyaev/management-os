"use client";

import { Download } from "lucide-react";

/**
 * Platform · super-admin — export the tenant directory as CSV.
 *
 * The rows are already loaded server-side (listOrganizations on the
 * platform page) and passed in here; this island just serialises them
 * to a CSV blob and triggers a browser download. No money math, no
 * client-supplied org ids — purely a client-side render of data the
 * super-admin already sees on screen.
 */

export interface OrgExportRow {
  organizationCode: string;
  name: string;
  organizationType: string;
  subscriptionTier: string;
  countryCode: string;
  primaryCurrency: string;
  isActive: boolean;
  enabledModules: string[];
}

function csvCell(value: string): string {
  // Quote anything containing a comma, quote, or newline; double internal quotes.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function OrganizationsExportButton({ rows }: { rows: OrgExportRow[] }) {
  function handleExport() {
    const header = [
      "code",
      "name",
      "type",
      "tier",
      "country",
      "currency",
      "status",
      "modules",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.organizationCode),
          csvCell(r.name),
          csvCell(r.organizationType),
          csvCell(r.subscriptionTier),
          csvCell(r.countryCode),
          csvCell(r.primaryCurrency),
          csvCell(r.isActive ? "active" : "archived"),
          csvCell((r.enabledModules ?? []).join("; ")),
        ].join(","),
      );
    }
    const content = "﻿" + lines.join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organizations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      className="btn btn-dark btn-sm"
      onClick={handleExport}
      disabled={rows.length === 0}
      data-testid="org-export-csv"
    >
      <Download className="w-4 h-4" strokeWidth={1.75} />
      Export
    </button>
  );
}
