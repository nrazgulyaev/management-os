import type { ReactNode } from "react";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

/**
 * Finance cabinet RBAC gate — hoisted to the cabinet root so EVERY finance
 * sub-route inherits it.
 *
 * Previously only `finance/page.tsx` and `finance/management-pnl/page.tsx`
 * called `requireCabinetAccess("finance")`. The other sub-surfaces
 * (statements / payouts / revenue / fees / expenses / taxes / reserves /
 * periods / disputes / fee-rules / transparency / statement-settings /
 * material-usage, and their nested detail routes) had NO gate, so a same-org
 * user denied the Finance cabinet via `role_access_overrides` could still
 * read owner net payouts, statements, and disputes by typing the URL.
 *
 * Layouts wrap every page nested beneath them in the App Router, so a single
 * server-component gate here closes the whole cabinet. The two pages that
 * still call the gate inline are harmless (the deny short-circuits here
 * first); leaving them avoids churn.
 */
export default async function FinanceCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { allowed } = await requireCabinetAccess("finance");
  if (!allowed) return <CabinetGate cabinet="Finance" />;
  return <>{children}</>;
}
