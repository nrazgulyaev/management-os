"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImportBoqModal } from "@/components/boq/import-boq-modal";

/**
 * Phase 2.2 dev-03 — wraps `ImportBoqModal` as a page surface so
 * deep-links to `/cabinets/qs/import` open the wizard.
 */

export function ImportBoqPageClient({ projectLabel }: { projectLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);
  return (
    <ImportBoqModal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) router.push("/development-os/cabinets/qs");
      }}
      projectLabel={projectLabel}
    />
  );
}
