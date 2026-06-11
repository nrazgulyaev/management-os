"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewProjectDrawer } from "@/components/development/new-project-drawer";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

/**
 * Client host for the `projects/new` route. Opens the existing
 * <NewProjectDrawer> (the working create-project surface backed by
 * `createDevelopmentProject`) immediately on mount so the hub's
 * "New project +" CTA lands on a real form instead of a notFound().
 * Closing the drawer returns to the projects list.
 */
export function NewProjectClient() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Open create form
      </Button>
      <NewProjectDrawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) router.push(`${DEVELOPMENT_APP_PATH}/projects`);
        }}
      />
    </>
  );
}
