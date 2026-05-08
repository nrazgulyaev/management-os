import { Database, AlertTriangle } from "lucide-react";
import { isDbConfigured } from "@/lib/env";

export function DbStatusNotice() {
  if (isDbConfigured()) {
    return (
      <div className="rounded-md border border-success/30 bg-success-weak/40 px-4 py-2.5 flex items-center gap-3 text-sm text-ink">
        <Database className="w-4 h-4 text-success" strokeWidth={1.75} />
        <span>
          Connected to live database. Records you create will be persisted.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-warning/30 bg-warning-weak/40 px-4 py-2.5 flex items-center gap-3 text-sm text-ink">
      <AlertTriangle className="w-4 h-4 text-warning" strokeWidth={1.75} />
      <span>
        Read-only demo mode. Database persistence is disabled — contact
        support to provision live storage for this workspace.
      </span>
    </div>
  );
}
