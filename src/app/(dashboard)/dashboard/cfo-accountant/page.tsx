import { redirect } from "next/navigation";

/**
 * Stage 10.5.A.3.4 — Dev OS cabinet redirect.
 *
 * The CFO/Accountant cabinet lives in Dev OS. Users typing the
 * Mgmt OS URL pattern (/dashboard/{role}) land here and get
 * forwarded to the canonical Dev OS route. See
 * docs/stage-10-5-cabinet-dashboard-pattern.md for the routing
 * convention.
 */

export const dynamic = "force-dynamic";

export default function CfoAccountantRedirectPage() {
  redirect("/development-os/cabinets/cfo-accountant");
}
