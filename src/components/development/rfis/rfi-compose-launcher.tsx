"use client";

/**
 * W3 RFI loop — compose launcher.
 *
 * Mounts the (previously orphaned) RFIComposeModal on the project RFI inbox
 * and wires its onSubmit to the real `composeRfi` server action. Translates
 * the modal's discipline hint vocabulary (architecture / interior / …) to
 * the rfis.discipline enum (architectural / finishes / …) before routing.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  RfiComposeModal,
  type RfiComposeValues,
} from "@/components/projects/rfi-compose-modal";
import { composeRfi } from "@/lib/development/server/rfis/rfi-actions";
import type { RfiDiscipline } from "@/lib/db/schema/rfis";

/** Maps the modal's discipline-hint vocab onto the rfis.discipline enum. */
function hintToDiscipline(hint: RfiComposeValues["disciplineHint"]): RfiDiscipline {
  switch (hint) {
    case "architecture":
      return "architectural";
    case "structural":
      return "structural";
    case "mep":
      return "mep";
    case "interior":
      return "finishes";
    case "other":
      return "other";
    case "auto":
    default:
      // No hint → let the router fall back from "other" to the PM roster.
      return "other";
  }
}

export function RfiComposeLauncher({
  projectId,
  projectCode,
  projectSlug,
}: {
  projectId: string;
  projectCode: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function handleSubmit(values: RfiComposeValues) {
    const result = await composeRfi({
      projectId,
      projectCode,
      projectSlug,
      question: values.question,
      discipline: hintToDiscipline(values.disciplineHint),
      priority: "medium",
    });
    router.refresh();
    return { ref: result.ref, routedTo: result.routedTo };
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Compose RFI</Button>
      <RfiComposeModal
        open={open}
        onOpenChange={setOpen}
        projectCode={projectCode}
        onSubmit={handleSubmit}
      />
    </>
  );
}
